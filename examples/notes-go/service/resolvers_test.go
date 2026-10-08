package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"example.com/notes-go/hozu"
)

const secret = "test-secret-0123456789"

func post(t *testing.T, h http.Handler, body string, header map[string]string) (int, string) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/effect", strings.NewReader(body))
	req.Header.Set("X-Hozu-Fingerprint", hozu.Fingerprint)
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
}
