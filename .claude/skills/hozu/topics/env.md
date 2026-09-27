# Environment

`project({ env: { server: z.object({ DB_URL: z.string() }), public: z.object({ SUPPORT_EMAIL: z.string().email() }) } })`.
Both are parsed at startup (defaults and `z.coerce` apply; a missing value stops startup). Resolvers read
`ctx.env`; views read public values with `ui.env(PublicEnv).SUPPORT_EMAIL`. Machines cannot read env (HZ041).
