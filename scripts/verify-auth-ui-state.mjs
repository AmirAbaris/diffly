import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

process.stdout.write(
  "==> Verifying User Authentication UI & State Management (#27)...\n"
)

// 1. Verify file presence
process.stdout.write("--> Checking required files exist...\n")
const requiredFiles = [
  "components/auth/auth-modal.tsx",
  "components/auth/sign-in-form.tsx",
  "components/auth/sign-up-form.tsx",
  "lib/auth.ts",
  "hooks/use-auth.ts",
  "components/layout/user-nav.tsx",
  "components/layout/navbar.tsx",
  "components/layout/header.tsx",
  "components/layout/nav-stats.tsx",
]

for (const relPath of requiredFiles) {
  const fullPath = path.resolve(process.cwd(), relPath)
  assert.ok(fs.existsSync(fullPath), `Required file missing: ${relPath}`)
}
process.stdout.write("✓ All required files exist on disk\n")

// 2. Verify lib/auth.ts implementation
process.stdout.write("--> Inspecting lib/auth.ts...\n")
const authSource = fs.readFileSync(
  path.resolve(process.cwd(), "lib/auth.ts"),
  "utf-8"
)

assert.ok(
  authSource.includes("export function useAuth()"),
  "lib/auth.ts must export useAuth()"
)
assert.ok(
  authSource.includes("export async function apiLogin("),
  "lib/auth.ts must export apiLogin()"
)
assert.ok(
  authSource.includes("export async function apiRegister("),
  "lib/auth.ts must export apiRegister()"
)
assert.ok(
  authSource.includes("export async function apiLogout("),
  "lib/auth.ts must export apiLogout()"
)
assert.ok(
  authSource.includes("export async function fetchCurrentUser("),
  "lib/auth.ts must export fetchCurrentUser()"
)
assert.ok(
  authSource.includes("export function getAuthErrorMessage("),
  "lib/auth.ts must export getAuthErrorMessage()"
)
assert.ok(
  authSource.includes("session_id: sessionId"),
  "apiLogin and apiRegister must include session_id for session migration"
)
assert.ok(
  authSource.includes("claimSession(sessionId)"),
  "lib/auth.ts should trigger session claiming"
)
assert.ok(
  authSource.includes("mutateUserStats()"),
  "useAuth must revalidate user stats upon login/register/logout"
)
assert.ok(
  authSource.includes('mutate("/api/challenges")'),
  "useAuth must revalidate challenges upon login/register/logout"
)
process.stdout.write("✓ lib/auth.ts satisfies all architectural criteria\n")

// 3. Verify hooks/use-auth.ts backwards compatibility
process.stdout.write("--> Inspecting hooks/use-auth.ts...\n")
const hooksAuthSource = fs.readFileSync(
  path.resolve(process.cwd(), "hooks/use-auth.ts"),
  "utf-8"
)
assert.ok(
  hooksAuthSource.includes('from "@/lib/auth"'),
  "hooks/use-auth.ts must re-export from @/lib/auth"
)
assert.ok(
  hooksAuthSource.includes("useAuth"),
  "hooks/use-auth.ts must export useAuth"
)
process.stdout.write("✓ hooks/use-auth.ts forwards cleanly to @/lib/auth\n")

// 4. Verify components/auth/auth-modal.tsx
process.stdout.write("--> Inspecting components/auth/auth-modal.tsx...\n")
const modalSource = fs.readFileSync(
  path.resolve(process.cwd(), "components/auth/auth-modal.tsx"),
  "utf-8"
)
assert.ok(modalSource.includes("Tabs"), "AuthModal must use Tabs component")
assert.ok(
  modalSource.includes('value="signin"'),
  "AuthModal must have signin tab"
)
assert.ok(
  modalSource.includes('value="signup"'),
  "AuthModal must have signup tab"
)
assert.ok(
  modalSource.includes("SignInForm"),
  "AuthModal must render SignInForm"
)
assert.ok(
  modalSource.includes("SignUpForm"),
  "AuthModal must render SignUpForm"
)
assert.ok(
  modalSource.includes('role="alert"'),
  "AuthModal must have role='alert' for error display"
)
assert.ok(
  modalSource.includes("auth-error-banner"),
  "AuthModal error banner must have test id"
)
assert.ok(
  !modalSource.includes("setActiveTab(defaultTab)"),
  "Must not call setState synchronously within effect"
)
process.stdout.write(
  "✓ components/auth/auth-modal.tsx satisfies acceptance criteria\n"
)

// 5. Verify components/auth/sign-in-form.tsx & sign-up-form.tsx
process.stdout.write("--> Inspecting Sign In & Sign Up forms...\n")
const signInSource = fs.readFileSync(
  path.resolve(process.cwd(), "components/auth/sign-in-form.tsx"),
  "utf-8"
)
assert.ok(
  signInSource.includes("login-identifier"),
  "SignInForm must have username/email field"
)
assert.ok(
  signInSource.includes("login-password"),
  "SignInForm must have password field"
)
assert.ok(signInSource.includes("login("), "SignInForm must call login()")

const signUpSource = fs.readFileSync(
  path.resolve(process.cwd(), "components/auth/sign-up-form.tsx"),
  "utf-8"
)
assert.ok(
  signUpSource.includes("register-email"),
  "SignUpForm must have email field"
)
assert.ok(
  signUpSource.includes("register-username"),
  "SignUpForm must have username field"
)
assert.ok(
  signUpSource.includes("register-password"),
  "SignUpForm must have password field"
)
assert.ok(
  signUpSource.includes("register-confirm"),
  "SignUpForm must have confirm password field"
)
assert.ok(signUpSource.includes("register("), "SignUpForm must call register()")
process.stdout.write("✓ Form fields match all required inputs\n")

// 6. Verify components/layout/user-nav.tsx
process.stdout.write("--> Inspecting components/layout/user-nav.tsx...\n")
const userNavSource = fs.readFileSync(
  path.resolve(process.cwd(), "components/layout/user-nav.tsx"),
  "utf-8"
)
assert.ok(
  userNavSource.includes('data-testid="sign-in-button"'),
  "UserNav unauthenticated must have Sign In button"
)
assert.ok(
  userNavSource.includes('data-testid="register-button"'),
  "UserNav unauthenticated must have Register button"
)
assert.ok(userNavSource.includes("Sign In"), "UserNav must display 'Sign In'")
assert.ok(userNavSource.includes("Register"), "UserNav must display 'Register'")
assert.ok(
  userNavSource.includes("DropdownMenu"),
  "UserNav authenticated must use DropdownMenu"
)
assert.ok(
  userNavSource.includes("Avatar"),
  "UserNav authenticated must render Avatar"
)
assert.ok(
  userNavSource.includes("Profile"),
  "UserNav dropdown must include Profile"
)
assert.ok(
  userNavSource.includes("Stats"),
  "UserNav dropdown must include Stats"
)
assert.ok(
  userNavSource.includes("Sign Out"),
  "UserNav dropdown must include Sign Out"
)
process.stdout.write(
  "✓ components/layout/user-nav.tsx satisfies unauthenticated and authenticated UI criteria\n"
)

// 7. Verify components/layout/navbar.tsx & components/layout/header.tsx
process.stdout.write("--> Inspecting Navbar & Header...\n")
const navbarSource = fs.readFileSync(
  path.resolve(process.cwd(), "components/layout/navbar.tsx"),
  "utf-8"
)
assert.ok(navbarSource.includes("NavStats"), "Navbar must include NavStats")
assert.ok(navbarSource.includes("UserNav"), "Navbar must include UserNav")
assert.ok(navbarSource.includes("Diffly"), "Navbar must include Diffly brand")

const headerSource = fs.readFileSync(
  path.resolve(process.cwd(), "components/layout/header.tsx"),
  "utf-8"
)
assert.ok(headerSource.includes("Navbar"), "Header must alias or export Navbar")
process.stdout.write(
  "✓ components/layout/navbar.tsx and header.tsx connected properly\n"
)

process.stdout.write(
  "\n==> Issue #27 Verification passed with 100% success! 🎉\n"
)
