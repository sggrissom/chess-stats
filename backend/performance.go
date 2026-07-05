package backend

import (
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"go.hasen.dev/vbeam"
)

const slowRequestThreshold = 750 * time.Millisecond

type PerformanceEndpointSummary struct {
	Path           string  `json:"path"`
	Count          int64   `json:"count"`
	SlowCount      int64   `json:"slowCount"`
	ErrorCount     int64   `json:"errorCount"`
	TotalMs        int64   `json:"totalMs"`
	AverageMs      float64 `json:"averageMs"`
	MaxMs          int64   `json:"maxMs"`
	LastStatus     int     `json:"lastStatus"`
	LastDurationMs int64   `json:"lastDurationMs"`
	LastSeen       int64   `json:"lastSeen"`
}

type PerformanceRequestSample struct {
	Path       string `json:"path"`
	Method     string `json:"method"`
	Status     int    `json:"status"`
	DurationMs int64  `json:"durationMs"`
	At         int64  `json:"at"`
}

type PerformanceInfoResponse struct {
	Success                bool                         `json:"success"`
	Error                  string                       `json:"error,omitempty"`
	SlowRequestThresholdMs int64                        `json:"slowRequestThresholdMs"`
	TotalRequests          int64                        `json:"totalRequests"`
	SlowRequests           int64                        `json:"slowRequests"`
	ErrorRequests          int64                        `json:"errorRequests"`
	AverageMs              float64                      `json:"averageMs"`
	MaxMs                  int64                        `json:"maxMs"`
	Endpoints              []PerformanceEndpointSummary `json:"endpoints"`
	RecentSlowRequests     []PerformanceRequestSample   `json:"recentSlowRequests"`
}

type endpointPerf struct {
	path           string
	count          int64
	slowCount      int64
	errorCount     int64
	totalMs        int64
	maxMs          int64
	lastStatus     int
	lastDurationMs int64
	lastSeen       time.Time
}

type performanceStore struct {
	mu         sync.Mutex
	endpoints  map[string]*endpointPerf
	recentSlow []PerformanceRequestSample
}

var perfStore = performanceStore{endpoints: make(map[string]*endpointPerf)}

func RegisterPerformanceMethods(app *vbeam.Application) {
	vbeam.RegisterProc(app, GetPerformanceInfo)
}

func PerformanceMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rw := &performanceResponseWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rw, r)
		recordRequestPerformance(r, rw.status, time.Since(start))
	})
}

type performanceResponseWriter struct {
	http.ResponseWriter
	status int
}

func (w *performanceResponseWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

func recordRequestPerformance(r *http.Request, status int, duration time.Duration) {
	path := normalizePerformancePath(r)
	durationMs := duration.Milliseconds()
	isSlow := duration >= slowRequestThreshold
	isError := status >= 500
	now := time.Now()

	perfStore.mu.Lock()
	defer perfStore.mu.Unlock()

	ep := perfStore.endpoints[path]
	if ep == nil {
		ep = &endpointPerf{path: path}
		perfStore.endpoints[path] = ep
	}
	ep.count++
	ep.totalMs += durationMs
	if isSlow {
		ep.slowCount++
	}
	if isError {
		ep.errorCount++
	}
	if durationMs > ep.maxMs {
		ep.maxMs = durationMs
	}
	ep.lastStatus = status
	ep.lastDurationMs = durationMs
	ep.lastSeen = now

	if isSlow {
		sample := PerformanceRequestSample{
			Path:       path,
			Method:     r.Method,
			Status:     status,
			DurationMs: durationMs,
			At:         now.Unix(),
		}
		LogWarnWithRequest(r, LogCategoryAPI, "Slow request", sample)
		perfStore.recentSlow = append([]PerformanceRequestSample{sample}, perfStore.recentSlow...)
		if len(perfStore.recentSlow) > 25 {
			perfStore.recentSlow = perfStore.recentSlow[:25]
		}
	}
}

func normalizePerformancePath(r *http.Request) string {
	path := r.URL.Path
	if strings.HasPrefix(path, "/rpc/") {
		return path
	}
	if strings.HasPrefix(path, "/data/") {
		return path
	}
	return r.Method + " " + path
}

func GetPerformanceInfo(ctx *vbeam.Context, req Empty) (resp PerformanceInfoResponse, err error) {
	user, authErr := GetAuthUser(ctx)
	if authErr != nil || user.Id == 0 {
		resp.Error = "Authentication required"
		return
	}
	if user.Id != 1 {
		resp.Error = "Admin access required"
		return
	}

	perfStore.mu.Lock()
	defer perfStore.mu.Unlock()

	resp.Success = true
	resp.SlowRequestThresholdMs = slowRequestThreshold.Milliseconds()
	resp.RecentSlowRequests = append([]PerformanceRequestSample(nil), perfStore.recentSlow...)

	for _, ep := range perfStore.endpoints {
		summary := PerformanceEndpointSummary{
			Path:           ep.path,
			Count:          ep.count,
			SlowCount:      ep.slowCount,
			ErrorCount:     ep.errorCount,
			TotalMs:        ep.totalMs,
			MaxMs:          ep.maxMs,
			LastStatus:     ep.lastStatus,
			LastDurationMs: ep.lastDurationMs,
			LastSeen:       ep.lastSeen.Unix(),
		}
		if ep.count > 0 {
			summary.AverageMs = float64(ep.totalMs) / float64(ep.count)
		}
		resp.TotalRequests += ep.count
		resp.SlowRequests += ep.slowCount
		resp.ErrorRequests += ep.errorCount
		resp.MaxMs = max(resp.MaxMs, ep.maxMs)
		resp.Endpoints = append(resp.Endpoints, summary)
	}
	if resp.TotalRequests > 0 {
		var totalMs int64
		for _, ep := range perfStore.endpoints {
			totalMs += ep.totalMs
		}
		resp.AverageMs = float64(totalMs) / float64(resp.TotalRequests)
	}
	sort.Slice(resp.Endpoints, func(i, j int) bool {
		if resp.Endpoints[i].SlowCount != resp.Endpoints[j].SlowCount {
			return resp.Endpoints[i].SlowCount > resp.Endpoints[j].SlowCount
		}
		return resp.Endpoints[i].AverageMs > resp.Endpoints[j].AverageMs
	})
	if len(resp.Endpoints) > 20 {
		resp.Endpoints = resp.Endpoints[:20]
	}
	return
}
