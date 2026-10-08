package main

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"slices"
	"sync"
	"time"

	"bench.local/remote/hozu"
)

type work struct{ upstream string }

func (w work) WorkEcho(_ *hozu.Ctx, in hozu.WorkEchoInput) (hozu.WorkEchoOutput, error) {
	return hozu.WorkEchoOutput{N: in.N}, nil
}

func (w work) WorkCrunch(_ *hozu.Ctx, in hozu.WorkCrunchInput) ([]hozu.Group, error) {
	groups := map[int64]*hozu.Group{}
	x := in.Seed
	for i := int64(0); i < in.Rows; i++ {
		x = (x * 48271) % 2147483647
		key := x % 500
		g, ok := groups[key]
		if !ok {
			g = &hozu.Group{Key: key}
			groups[key] = g
		}
		g.Count++
		g.Total += x % 1000
	}
	out := make([]hozu.Group, 0, len(groups))
	for _, g := range groups {
		out = append(out, *g)
	}
	slices.SortFunc(out, func(a, b hozu.Group) int {
		if a.Total != b.Total {
			return int(b.Total - a.Total)
		}
		return int(a.Key - b.Key)
	})
	return out[:min(10, len(out))], nil
}

func (w work) WorkFanout(ctx *hozu.Ctx, in hozu.WorkFanoutInput) (hozu.WorkFanoutOutput, error) {
	var mu sync.Mutex
	var wg sync.WaitGroup
	var total int64
	var failed error
	for i := int64(0); i < in.Calls; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			req, _ := http.NewRequestWithContext(ctx.Context, http.MethodGet, fmt.Sprintf("%s?i=%d", w.upstream, i), nil)
			res, err := http.DefaultClient.Do(req)
			if err == nil {
				var body []byte
				body, err = io.ReadAll(res.Body)
				res.Body.Close()
				mu.Lock()
				total += int64(len(body))
				mu.Unlock()
			}
			if err != nil {
				mu.Lock()
				failed = err
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	return hozu.WorkFanoutOutput{Bytes: total}, failed
}

func main() {
	http.DefaultTransport.(*http.Transport).MaxIdleConnsPerHost = 512
	upstream := http.NewServeMux()
	upstream.HandleFunc("/delay", func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(20 * time.Millisecond)
		w.Write([]byte(`{"ok":true,"padding":"................................................................"}`))
	})
	go func() { log.Fatal(http.ListenAndServe(os.Getenv("UPSTREAM_ADDR"), upstream)) }()
	mux := http.NewServeMux()
	mux.Handle("/effect", hozu.Handler(work{upstream: "http://" + os.Getenv("UPSTREAM_ADDR") + "/delay"}, hozu.Options{Secret: os.Getenv("BENCH_SECRET")}))
	log.Fatal(http.ListenAndServe(os.Getenv("SERVICE_ADDR"), mux))
}
