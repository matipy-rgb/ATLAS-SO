(function () {
    window.ATLAS_CONFIG = {
        appName: "ATLAS SO",
        version: "0.8.0",

        // Pegá aquí los dos valores públicos de Settings > API en Supabase.
        // La publishable key puede estar en el navegador; nunca uses la service_role key.
        supabaseUrl: "",
        supabasePublishableKey: "",

        // Al iniciar sesión por primera vez, los datos de la versión anterior se
        // asignan a ese usuario y se sincronizan con su espacio personal.
        migrateLegacyDataOnFirstLogin: "confirm"
    };
})();
