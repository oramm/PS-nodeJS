# 🧪 Setup Testing Framework
# Run this script to install and configure automated testing

Write-Host "📦 Installing testing dependencies..." -ForegroundColor Cyan

# Install Jest and TypeScript support
yarn add --dev jest @types/jest ts-jest @jest/globals

Write-Host "✅ Dependencies installed!" -ForegroundColor Green

# Update package.json with test scripts
Write-Host "`n📝 Test scripts will be added to package.json..." -ForegroundColor Cyan
Write-Host "Add these to your package.json scripts section:" -ForegroundColor Yellow
Write-Host '  "test": "jest"' -ForegroundColor White
Write-Host '  "test:watch": "jest --watch"' -ForegroundColor White
Write-Host '  "test:coverage": "jest --coverage"' -ForegroundColor White
Write-Host '  "test:offers": "jest src/offers"' -ForegroundColor White

# Run tests
Write-Host "`n🧪 Running tests..." -ForegroundColor Cyan
yarn test

Write-Host "`n✅ Setup complete!" -ForegroundColor Green
Write-Host "`n📚 Available commands:" -ForegroundColor Yellow
Write-Host "  yarn test              - Run all tests" -ForegroundColor White
Write-Host "  yarn test:watch        - Run tests in watch mode" -ForegroundColor White
Write-Host "  yarn test:coverage     - Run tests with coverage report" -ForegroundColor White
Write-Host "  yarn test:offers       - Run only Offers module tests" -ForegroundColor White
Write-Host "`n📖 See documentation/team/runbooks/testing.md for more information" -ForegroundColor Cyan
