package backend

import (
	"encoding/json"
	"log"
	"net/http"
	"time"
)

// logLevel represents different log levels (internal type)
type logLevel string

const (
	logLevelInfo  logLevel = "INFO"
	logLevelWarn  logLevel = "WARN"
	logLevelError logLevel = "ERROR"
	logLevelDebug logLevel = "DEBUG"
)

// logCategory represents different areas of the application (internal type)
type logCategory string

const (
	logCategoryAuth   logCategory = "AUTH"
	logCategoryAdmin  logCategory = "ADMIN"
	logCategoryAPI    logCategory = "API"
	logCategoryWorker logCategory = "WORKER"
	logCategorySystem logCategory = "SYSTEM"
)

// logEntry represents a structured log entry (internal type)
type logEntry struct {
	Timestamp time.Time   `json:"timestamp"`
	Level     logLevel    `json:"level"`
	Category  logCategory `json:"category"`
	Message   string      `json:"message"`
	Data      interface{} `json:"data,omitempty"`
	UserID    *int        `json:"userId,omitempty"`
	IP        string      `json:"ip,omitempty"`
	UserAgent string      `json:"userAgent,omitempty"`
}

// logStructured writes a structured log entry
func logStructured(level logLevel, category logCategory, message string, data interface{}, r *http.Request) {
	entry := logEntry{
		Timestamp: time.Now(),
		Level:     level,
		Category:  category,
		Message:   message,
		Data:      data,
	}

	// Add request context if available
	if r != nil {
		entry.IP = getClientIP(r)
		entry.UserAgent = r.Header.Get("User-Agent")

		// Try to get user from context
		if user, ok := GetUserFromContext(r); ok {
			entry.UserID = &user.Id
		}
	}

	// Marshal to JSON
	jsonBytes, err := json.Marshal(entry)
	if err != nil {
		log.Printf("[%s] [%s] %s - JSON marshal error: %v", level, category, message, err)
		return
	}

	log.Println(string(jsonBytes))
}

// Public constants for logging categories
const (
	LogCategoryAuth   = "AUTH"
	LogCategoryAdmin  = "ADMIN"
	LogCategoryAPI    = "API"
	LogCategoryWorker = "WORKER"
	LogCategorySystem = "SYSTEM"
)

// LogInfo logs an info-level message
func LogInfo(category string, message string, data ...interface{}) {
	var d interface{}
	if len(data) > 0 {
		d = data[0]
	}
	logStructured(logLevelInfo, logCategory(category), message, d, nil)
}

// LogInfoWithRequest logs an info-level message with request context
func LogInfoWithRequest(r *http.Request, category string, message string, data ...interface{}) {
	var d interface{}
	if len(data) > 0 {
		d = data[0]
	}
	logStructured(logLevelInfo, logCategory(category), message, d, r)
}

// LogWarn logs a warning-level message
func LogWarn(category string, message string, data ...interface{}) {
	var d interface{}
	if len(data) > 0 {
		d = data[0]
	}
	logStructured(logLevelWarn, logCategory(category), message, d, nil)
}

// LogWarnWithRequest logs a warning-level message with request context
func LogWarnWithRequest(r *http.Request, category string, message string, data ...interface{}) {
	var d interface{}
	if len(data) > 0 {
		d = data[0]
	}
	logStructured(logLevelWarn, logCategory(category), message, d, r)
}

// LogErrorSimple logs an error-level message
func LogErrorSimple(category string, message string, data ...interface{}) {
	var d interface{}
	if len(data) > 0 {
		d = data[0]
	}
	logStructured(logLevelError, logCategory(category), message, d, nil)
}

// LogErrorWithRequest logs an error-level message with request context
func LogErrorWithRequest(r *http.Request, category string, message string, data ...interface{}) {
	var d interface{}
	if len(data) > 0 {
		d = data[0]
	}
	logStructured(logLevelError, logCategory(category), message, d, r)
}

// LogDebug logs a debug-level message
func LogDebug(category string, message string, data ...interface{}) {
	var d interface{}
	if len(data) > 0 {
		d = data[0]
	}
	logStructured(logLevelDebug, logCategory(category), message, d, nil)
}

// getClientIP extracts the client IP from the request
func getClientIP(r *http.Request) string {
	xff := r.Header.Get("X-Forwarded-For")
	if xff != "" {
		for i, c := range xff {
			if c == ',' {
				return xff[:i]
			}
		}
		return xff
	}

	xri := r.Header.Get("X-Real-IP")
	if xri != "" {
		return xri
	}

	return r.RemoteAddr
}
