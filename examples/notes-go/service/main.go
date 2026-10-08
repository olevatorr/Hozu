package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"example.com/notes-go/hozu"
)

func main() {
	secret := os.Getenv("NOTES_SERVICE_SECRET")
	if len(secret) < 16 {
		log.Fatal("NOTES_SERVICE_SECRET must hold at least 16 characters, the same value the Hozu app has")
	}
	addr := os.Getenv("NOTES_SERVICE_ADDR")
	if addr == "" {
		addr = "127.0.0.1:4801"
	}
	mux := http.NewServeMux()
	mux.Handle("/effect", hozu.Handler(newResolvers(), hozu.Options{Secret: secret}))
	server := &http.Server{Addr: addr, Handler: mux}
	go func() {
		log.Printf("notes service on http://%s/effect", addr)
		if err := server.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()
	stop, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	<-stop.Done()
	ctx, done := context.WithTimeout(context.Background(), 5*time.Second)
	defer done()
	if err := server.Shutdown(ctx); err != nil {
		log.Print(err)
	}
}
