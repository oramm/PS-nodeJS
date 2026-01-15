# 🚀 Dev Login dla Playwright - Backend Setup

## ✅ Zaimplementowane zmiany

### 1. ToolsGapi.ts - Metoda `loginHandler`

Dodano obsługę dev mode na początku metody `loginHandler`:

```typescript
// ⚠️ DEV MODE: Check for mock authentication
const { dev_mode, mock_user } = req.body;

if (dev_mode === true) {
    // SECURITY: Only allow in development with explicit flag
    if (
        process.env.NODE_ENV !== 'development' ||
        process.env.ENABLE_DEV_LOGIN !== 'true'
    ) {
        throw new Error('Dev mode login is not allowed in this environment');
    }

    console.warn('🔧 DEV MODE: Mock authentication - bypassing Google OAuth');

    // Mock user data for Playwright/testing
    req.session.userData = {
        enviId: 1,
        googleId: 'mock-google-id-playwright',
        systemEmail: 'playwright@test.local',
        userName: mock_user || 'Playwright Test User',
        picture: 'https://www.gravatar.com/avatar/?d=mp',
        systemRoleName: SystemRoleName.ADMIN,
        systemRoleId: 1,
    };

    console.log('🔧 DEV: Mock user data set in session:', req.session.userData);
    return; // Exit early, skip Google OAuth
}
```

### 2. .env - Zmienne środowiskowe

Dodano zmienną `ENABLE_DEV_LOGIN=true`:

```bash
NODE_ENV=development
ENABLE_DEV_LOGIN=true
```

### 3. Gauth2Routers.ts

Route `/login` już istnieje i działa poprawnie:

```typescript
app.post('/login', async (req: Request, res: Response, next) => {
    try {
        await ToolsGapi.loginHandler(req, res);
        console.log(`user: ${JSON.stringify(req.session.userData)} logged in`);
        res.send(req.session);
    } catch (error) {
        if (error instanceof Error)
            res.status(401).send({ errorMessage: error.message });
        console.error(error);
    }
});
```

## 🔒 Bezpieczeństwo

### Zabezpieczenia w kodzie:

1. ✅ Sprawdzenie `NODE_ENV !== 'development'`
2. ✅ Sprawdzenie `ENABLE_DEV_LOGIN !== 'true'`
3. ✅ Używanie enum `SystemRoleName.ADMIN` zamiast string
4. ✅ Wyraźne ostrzeżenie w konsoli: `🔧 DEV MODE: Mock authentication`

### Na produkcji (Heroku):

Wystarczy NIE ustawić lub ustawić na `false`:

```bash
NODE_ENV=production
ENABLE_DEV_LOGIN=false  # lub usuń tę linię
```

Backend automatycznie zablokuje dev login z błędem:

```
Error 401: Dev mode login is not allowed in this environment
```

## 🚀 Użycie

### 1. Uruchom backend

```bash
npm run dev
# lub
node build/index.js
```

### 2. Frontend wyśle request:

```typescript
const response = await fetch('http://localhost:3000/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
        dev_mode: true,
        mock_user: 'Playwright Test User', // opcjonalne
    }),
});
```

### 3. Backend odpowie:

```json
{
    "userData": {
        "enviId": 1,
        "googleId": "mock-google-id-playwright",
        "systemEmail": "playwright@test.local",
        "userName": "Playwright Test User",
        "picture": "https://www.gravatar.com/avatar/?d=mp",
        "systemRoleName": "ADMIN",
        "systemRoleId": 1
    }
}
```

## 🧪 Testowanie

### Test 1: Dev mode działa

```bash
# .env
NODE_ENV=development
ENABLE_DEV_LOGIN=true

# Rezultat: ✅ Logowanie działa, w konsoli:
# 🔧 DEV MODE: Mock authentication - bypassing Google OAuth
# 🔧 DEV: Mock user data set in session: {...}
```

### Test 2: Produkcja blokuje dev mode

```bash
# .env
NODE_ENV=production
ENABLE_DEV_LOGIN=true

# Rezultat: ❌ Error 401
# Dev mode login is not allowed in this environment
```

### Test 3: Dev mode wyłączony

```bash
# .env
NODE_ENV=development
ENABLE_DEV_LOGIN=false

# Rezultat: ❌ Error 401
# Dev mode login is not allowed in this environment
```

## 📦 Pliki zmodyfikowane

1. ✅ `src/setup/Sessions/ToolsGapi.ts` - dodano logikę dev mode
2. ✅ `.env` - dodano `ENABLE_DEV_LOGIN=true`

## 🔄 Kolejne kroki

1. ✅ Backend zaimplementowany
2. ✅ Bezpieczeństwo dodane
3. ✅ Kompilacja działa
4. 🔜 Testowanie z frontendem
5. 🔜 Testy Playwright

## 🐛 Troubleshooting

### Problem: Backend odrzuca dev login

```
Error: Dev mode login is not allowed in this environment
```

**Rozwiązanie:**

1. Sprawdź `.env`:
    ```bash
    NODE_ENV=development
    ENABLE_DEV_LOGIN=true
    ```
2. Zrestartuj backend
3. Sprawdź logi - powinno być: `🔧 DEV MODE: Mock authentication`

### Problem: Sesja nie zapisuje się

**Rozwiązanie:**

1. Sprawdź czy masz middleware sesji w `index.ts`
2. Sprawdź czy frontend wysyła `credentials: 'include'`
3. Sprawdź logi backendu - powinno być: `🔧 DEV: Mock user data set in session`

## 📚 Dokumentacja

Pełna dokumentacja: [BACKEND_DEV_LOGIN_EXAMPLE.md](../ENVI.ProjectSite/BACKEND_DEV_LOGIN_EXAMPLE.md)
