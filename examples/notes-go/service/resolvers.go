package main

import (
	"fmt"
	"slices"
	"strings"
	"sync"

	"example.com/notes-go/hozu"
)

const admin = "admin"

type resolvers struct {
	mu    sync.Mutex
	users []string
	notes map[string][]hozu.Note
	seq   int
}

func newResolvers() *resolvers {
	return &resolvers{
		users: []string{"ada", "bob"},
		notes: map[string][]hozu.Note{
			"ada": {{Id: "n1", Text: "Buy milk"}, {Id: "n2", Text: "Call Bob"}},
			"bob": {{Id: "n3", Text: "Bob's secret"}},
		},
		seq: 3,
	}
}

func userOf(ctx *hozu.Ctx) string {
	if ctx.Session == nil {
		return ""
	}
	return ctx.Session.User
}

func (r *resolvers) own(user string) []hozu.Note {
	if _, ok := r.notes[user]; !ok {
		r.users = append(r.users, user)
		r.notes[user] = []hozu.Note{}
	}
	return r.notes[user]
}

func ordered(list []hozu.Note) []hozu.Note {
	out := make([]hozu.Note, 0, len(list))
	for _, pinned := range []bool{true, false} {
		for _, n := range list {
			if n.Pinned == pinned {
				out = append(out, n)
			}
		}
	}
	return out
}

func (r *resolvers) visible(ctx *hozu.Ctx) []hozu.Note {
	r.mu.Lock()
	defer r.mu.Unlock()
	return ordered(r.notes[userOf(ctx)])
}

func (r *resolvers) AccountAccounts(ctx *hozu.Ctx, _ hozu.Empty) ([]hozu.AccountAccountsOutputItem, error) {
	if userOf(ctx) != admin {
		return nil, hozu.AccountAccountsNotAdmin{}
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]hozu.AccountAccountsOutputItem, 0, len(r.users))
	for _, name := range r.users {
		out = append(out, hozu.AccountAccountsOutputItem{Name: name, Notes: float64(len(r.notes[name]))})
	}
	return out, nil
}

func (r *resolvers) AccountMe(ctx *hozu.Ctx, _ hozu.Empty) (hozu.AccountMeOutput, error) {
	return hozu.AccountMeOutput{Name: userOf(ctx)}, nil
}

func (r *resolvers) AccountSignIn(ctx *hozu.Ctx, in hozu.AccountSignInInput) (hozu.Empty, error) {
	ctx.SetSession(hozu.Session{User: strings.ToLower(strings.TrimSpace(in.Name))})
	return hozu.Empty{}, nil
}

func (r *resolvers) AccountSignOut(ctx *hozu.Ctx, _ hozu.Empty) (hozu.Empty, error) {
	ctx.SignOut()
	return hozu.Empty{}, nil
}

func (r *resolvers) NotesListNotes(ctx *hozu.Ctx, _ hozu.Empty) ([]hozu.Note, error) {
	return r.visible(ctx), nil
}

func (r *resolvers) NotesNotesApi(ctx *hozu.Ctx, _ hozu.Empty) (hozu.NotesNotesApiOutput, error) {
	return hozu.NotesNotesApiOutput{SignedIn: ctx.Session != nil, Notes: r.visible(ctx)}, nil
}

func (r *resolvers) NotesAddNote(ctx *hozu.Ctx, in hozu.NotesAddNoteInput) (hozu.Note, error) {
	user := userOf(ctx)
	if user == "" {
		return hozu.Note{}, hozu.Invalid{Message: "Signed out", Fields: map[string]string{"text": "Sign in first"}}
	}
	text := strings.TrimSpace(in.Text)
	if text == "" {
		return hozu.Note{}, hozu.Invalid{Message: "text: Write something", Fields: map[string]string{"text": "Write something"}}
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	list := r.own(user)
	if slices.ContainsFunc(list, func(n hozu.Note) bool { return strings.EqualFold(n.Text, text) }) {
		return hozu.Note{}, hozu.NotesAddNoteDuplicate{Text: text}
	}
	r.seq++
	note := hozu.Note{Id: fmt.Sprintf("n%d", r.seq), Text: text}
	r.notes[user] = append([]hozu.Note{note}, list...)
	return note, nil
}

func (r *resolvers) NotesRemoveNote(ctx *hozu.Ctx, in hozu.NotesRemoveNoteInput) (hozu.NotesRemoveNoteOutput, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	user := userOf(ctx)
	list := r.own(user)
	at := slices.IndexFunc(list, func(n hozu.Note) bool { return n.Id == in.Id })
	if at < 0 {
		return hozu.NotesRemoveNoteOutput{}, hozu.NotesRemoveNoteNotFound{Id: in.Id}
	}
	r.notes[user] = slices.Delete(slices.Clone(list), at, at+1)
	return hozu.NotesRemoveNoteOutput{Id: in.Id}, nil
}

func (r *resolvers) NotesRemoveNotes(ctx *hozu.Ctx, in hozu.NotesRemoveNotesInput) (hozu.NotesRemoveNotesOutput, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	user := userOf(ctx)
	list := r.own(user)
	kept := slices.DeleteFunc(slices.Clone(list), func(n hozu.Note) bool { return slices.Contains(in.Ids, n.Id) })
	r.notes[user] = kept
	return hozu.NotesRemoveNotesOutput{Count: float64(len(list) - len(kept))}, nil
}

func (r *resolvers) NotesPinNotes(ctx *hozu.Ctx, in hozu.NotesPinNotesInput) (hozu.NotesPinNotesOutput, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	list := r.own(userOf(ctx))
	count := 0
	for i := range list {
		if slices.Contains(in.Ids, list[i].Id) {
			list[i].Pinned = true
			count++
		}
	}
	return hozu.NotesPinNotesOutput{Count: float64(count)}, nil
}

func (r *resolvers) NotesTogglePin(ctx *hozu.Ctx, in hozu.NotesTogglePinInput) (hozu.Note, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	list := r.own(userOf(ctx))
	at := slices.IndexFunc(list, func(n hozu.Note) bool { return n.Id == in.Id })
	if at < 0 {
		return hozu.Note{}, hozu.NotesTogglePinNotFound{Id: in.Id}
	}
	list[at].Pinned = !list[at].Pinned
	return list[at], nil
}
