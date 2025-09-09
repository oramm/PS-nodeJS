export const keys = {
    "installed": {
        "client_id": process.env.GOOGLE_CLIENT_ID as string,
        "project_id": process.env.GOOGLE_PROJECT_ID as string,
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "redirect_uris": [
            "http://localhost/Moje.ENVI/docs/",
            "http://localhost/envi.projectsite/"
        ],
        "token_uri": "https://oauth2.googleapis.com/token",
        "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
        "client_secret": process.env.GOOGLE_CLIENT_SECRET as string,
        "javascript_origins": [
            "http://localhost",
            "https://oramm.github.io",
            "https://sites.google.com",
            "https://ps.envi.com.pl",
            "http://ps.envi.com.pl",
            "http://erp.envi.com.pl",
            "https://erp.envi.com.pl"
        ]
    },
    "mongoDb": {
        host: process.env.MONGO_HOST as string,
        port: process.env.MONGO_PORT as string,
        database: process.env.MONGO_DATABASE as string,
        user: process.env.MONGO_USER as string,
        password: process.env.MONGO_PASSWORD as string,
        uri: process.env.MONGO_URI as string,
    }
}