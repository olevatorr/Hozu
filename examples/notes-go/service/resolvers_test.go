package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"example.com/notes-go/hozu"
)

const secret = "test-secret-0123456789"

func post(t *testing.T, h http.Handler, body string, header map[string]string) (int, string) {
	t.Helper()
	var call struct{ Effect string }
	if err := json.Unmarshal([]byte(body), &call); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/effect", strings.NewReader(body))
	req.Header.Set("X-Hozu-Fingerprint", hozu.Fingerprint(call.Effect))
	req.Header.Set("X-Hozu-Call", "c0ffee01")
	req.Header.Set("X-Hozu-Secret", secret)
	for k, v := range header {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec.Code, strings.TrimSpace(rec.Body.String())
}

func TestEffects(t *testing.T) {
	h := hozu.Handler(newResolvers(), hozu.Options{Secret: secret})
	ada := `"session":{"user":"ada"}`
	cases := []struct{ name, body, want string }{
		{"add", `{"effect":"notes.addNote","input":{"text":" Tea "},` + ada + `}`, `{"ok":{"id":"n4","text":"Tea","pinned":false}}`},
		{"duplicate", `{"effect":"notes.addNote","input":{"text":"tea"},` + ada + `}`, `{"fail":{"data":{"text":"tea"},"name":"Duplicate"}}`},
		{"blank", `{"effect":"notes.addNote","input":{"text":"  "},` + ada + `}`, `{"fail":{"data":{"message":"text: Write something","fields":{"text":"Write something"}},"name":"Invalid"}}`},
		{"empty list", `{"effect":"notes.listNotes","input":{},"session":{"user":"carol"}}`, `{"ok":[]}`},
		{"not admin", `{"effect":"account.accounts","input":{},` + ada + `}`, `{"fail":{"data":{},"name":"NotAdmin"}}`},
		{"sign in", `{"effect":"account.signIn","input":{"name":" Bob "},"session":null}`, `{"ok":{},"session":{"user":"bob"}}`},
		{"sign out", `{"effect":"account.signOut","input":{},` + ada + `}`, `{"ok":{},"session":null}`},
		{"api signed out", `{"effect":"notes.notesApi","input":{},"session":null}`, `{"ok":{"signedIn":false,"notes":[]}}`},
	}
	for _, c := range cases {
		if code, got := post(t, h, c.body, nil); code != 200 || got != c.want {
			t.Errorf("%s: %d %s, want %s", c.name, code, got, c.want)
		}
	}
}

func TestRefusals(t *testing.T) {
	h := hozu.Handler(newResolvers(), hozu.Options{Secret: secret})
	body := `{"effect":"notes.listNotes","input":{},"session":{"user":"ada"}}`
	if code, _ := post(t, h, body, map[string]string{"X-Hozu-Fingerprint": "0000"}); code != http.StatusConflict {
		t.Errorf("stale contract: %d, want 409", code)
	}
	if code, _ := post(t, h, body, map[string]string{"X-Hozu-Secret": "wrong"}); code != http.StatusUnauthorized {
		t.Errorf("wrong secret: %d, want 401", code)
	}
	other := `{"effect":"notes.addNote","input":{"text":"Tea"},"session":{"user":"ada"}}`
	if code, _ := post(t, h, other, map[string]string{"X-Hozu-Fingerprint": hozu.Fingerprint("notes.listNotes")}); code != http.StatusConflict {
		t.Errorf("another effect's fingerprint: %d, want 409", code)
	}
	if code, _ := post(t, h, `{"effect":"notes.nothing","input":{}}`, nil); code != http.StatusNotFound {
		t.Errorf("unknown effect: %d, want 404", code)
	}
}

type failing struct{ hozu.Resolvers }

func (failing) NotesListNotes(*hozu.Ctx, hozu.Empty) ([]hozu.Note, error) {
	return nil, errors.New("database closed\nat resolvers.go:12")
}

func TestFailure(t *testing.T) {
	h := hozu.Handler(failing{newResolvers()}, hozu.Options{Secret: secret})
	code, got := post(t, h, `{"effect":"notes.listNotes","input":{},"session":{"user":"ada"}}`, nil)
	if code != http.StatusInternalServerError || got != "resolver failed: database closed" {
		t.Errorf("failure: %d %q, want 500 with the first line", code, got)
	}
}
