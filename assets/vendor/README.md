# Fixed browser dependencies

These files mirror the exact versions already used by CRM; no dependency upgrade.
Retrieved from the official npm registry on 2026-11-05. Package tarballs verified
against npm `dist.integrity` SHA512 before extracting only UMD files and licenses.
No package install/lifecycle scripts executed.

| Package | Tarball integrity | Browser SHA256 |
| --- | --- | --- |
| @supabase/supabase-js 2.57.4 | sha512-LcbTzFhHYdwfQ7TRPfol0z04rLEyHabpGYANME6wkQ/kLtKNmI+Vy+WEM8HxeOZAtByUFxoUTTLwhXmrh+CcVw== | 7e94b62086deecef8c0ba3b38f514e2a1944ff6c81d92fb3ff967828c406c38f |
| lucide 0.468.0 | sha512-UFbgwji/ZnAV7iTTE4jujyTV7J95AILKyATDUrqOJrMcUGfXvGjw3c1mcuHZUX2oJfkrAGU9KoxkrLQk2jjtiA== | 3411692820cb8d47543f69496aa25fd603a358f4498046f41c508a5a3342210e |

Sources: https://registry.npmjs.org/@supabase/supabase-js/2.57.4 and
https://registry.npmjs.org/lucide/0.468.0 . Licenses preserved alongside the files.

The same-origin Supabase UMD is the normal startup path. Existing ESM CDN fallbacks
remain, and the last CDN uses UMD because the original raw module entry contains
bare package specifiers and extensionless imports. No authentication/RLS/API policy
or session-storage configuration changes. Optional source maps are not required.
