using System;
using System.Reflection;

namespace EnviPodpis
{
    internal static class Config
    {
        public const string ProductName = "ENVI Podpis";
        public const string ProtocolName = "envi-podpis";

        // Zrodlo adresu produkcyjnego: ENVI.ProjectSite/src/React/MainSetupReact.ts:25
        // (static serverUrl = ... "https://erp-envi.herokuapp.com/"), aplikacja Heroku "erp-envi".
        public const string ProductionBaseUrl = "https://erp-envi.herokuapp.com";

#if DEBUG
        // Tylko w wersji testowej (/define:DEBUG): lokalny backend PS (src/index.ts: PORT || 3000).
        public const string LocalBaseUrl = "http://localhost:3000";
#endif

        // Adres PS bierzemy WYLACZNIE z tej listy, nigdy z linku ani z odpowiedzi serwera.
        public static string[] AllowedBaseUrls
        {
            get
            {
#if DEBUG
                return new string[] { LocalBaseUrl, ProductionBaseUrl };
#else
                return new string[] { ProductionBaseUrl };
#endif
            }
        }

        public static bool IsDebugBuild
        {
            get
            {
#if DEBUG
                return true;
#else
                return false;
#endif
            }
        }

        public static Version CurrentVersion
        {
            get { return Assembly.GetExecutingAssembly().GetName().Version; }
        }

        public static string VersionText
        {
            get { return FormatVersion(CurrentVersion) + (IsDebugBuild ? " (testowa)" : ""); }
        }

        public static string FormatVersion(Version v)
        {
            return v.Major + "." + v.Minor + "." + (v.Build < 0 ? 0 : v.Build);
        }

        public const string RegistryAppKey = @"Software\ENVI\Podpis";
        public const string RegistryLastThumbprint = "LastThumbprint";
    }
}
