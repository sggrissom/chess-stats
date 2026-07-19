package backend

import "testing"

func TestSessionDateUsesBrowserTimezone(t *testing.T) {
	// 2026-07-19 01:30 UTC is still July 18 in UTC-7. Browsers report UTC-7
	// as a positive 420-minute Date.getTimezoneOffset value.
	const timestamp = int64(1784424600)
	if got := sessionDate(timestamp, "America/Los_Angeles", 0); got != "2026-07-18" {
		t.Fatalf("sessionDate() = %q, want %q", got, "2026-07-18")
	}
	if got := sessionDate(timestamp, "", -120); got != "2026-07-19" {
		t.Fatalf("sessionDate() = %q, want %q", got, "2026-07-19")
	}
}
