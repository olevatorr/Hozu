package main

import (
	"log"
	"net/http"
	"os"

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
	log.Printf("notes service on http://%s/effect", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}
