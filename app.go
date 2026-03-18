package chess

import (
	"chess/cfg"
	"go.hasen.dev/vbeam"
	"go.hasen.dev/vbolt"
	"net/http"
)

func OpenDB(dbpath string) *vbolt.DB {
	dbConnection := vbolt.Open(dbpath)
	vbolt.InitBuckets(dbConnection, &cfg.Info)
	return dbConnection
}

func MakeApplication() *vbeam.Application {
	db := OpenDB(cfg.DBPath)
	app := vbeam.NewApplication("ChessStats", db)

	app.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	return app
}
