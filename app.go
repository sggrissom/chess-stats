package chess

import (
	"chess/backend"
	"chess/cfg"
	"net/http"
	"os"

	"github.com/joho/godotenv"
	"go.hasen.dev/vbeam"
	"go.hasen.dev/vbolt"
)

func OpenDB(dbpath string) *vbolt.DB {
	dbConnection := vbolt.Open(dbpath)
	vbolt.InitBuckets(dbConnection, &cfg.Info)
	return dbConnection
}

func MakeApplication() *vbeam.Application {
	// Load .env file for local development; silently skip if absent
	_ = godotenv.Load()

	// In release mode, also try the shared env file
	if os.Getenv("PROD") == "true" || os.Getenv("ENVIRONMENT") == "production" {
		_ = godotenv.Load("/srv/apps/chess/shared/.env")
	}

	db := OpenDB(cfg.DBPath)
	app := vbeam.NewApplication("ChessStats", db)

	app.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	backend.SetupAuth(app)
	backend.RegisterUserMethods(app)
	backend.RegisterChessMethods(app)

	return app
}
