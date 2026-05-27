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

	// Clear all analysis records written before the packMoveAnalysis v2 bump.
	// Old records omit Brilliant/BrilliantReason bytes; reading them with the
	// new codec misaligns the buffer and panics. Raw-delete avoids deserialization.
	vbolt.ApplyDBProcess(dbConnection, "2026-0527-clear-analysis-for-v2", func() {
		vbolt.WithWriteTx(dbConnection, func(tx *vbolt.Tx) {
			for _, bucketName := range []string{"chess_game_analysis", "analysis_by_status"} {
				bkt := vbolt.TxRawBucket(tx, bucketName)
				var keys [][]byte
				bkt.ForEach(func(k, _ []byte) error {
					cp := make([]byte, len(k))
					copy(cp, k)
					keys = append(keys, cp)
					return nil
				})
				for _, k := range keys {
					bkt.Delete(k)
				}
			}
			vbolt.TxCommit(tx)
		})
	})

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
	backend.InitializeAnalysisWorker(db)

	return app
}
