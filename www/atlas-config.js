(function () {
    window.ATLAS_CONFIG = {
        appName: "ATLAS SO",
        version: "0.3.3",

        // Pegá aquí los dos valores públicos de Settings > API en Supabase.
        // La publishable key puede estar en el navegador; nunca uses la service_role key.
        supabaseUrl: "https://dxqaftxgbfibkocthkvr.supabase.co",
        supabasePublishableKey: "sb_publishable_uCyjn7gBOhKoizt-ao2W-g_mYcKrOoR",

        // Al iniciar sesión por primera vez, los datos de la versión anterior se
        // asignan a ese usuario y se sincronizan con su espacio personal.
        migrateLegacyDataOnFirstLogin: true
    };
})();
