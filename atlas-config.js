(function () {
    window.ATLAS_CONFIG = {
        appName: "ATLAS SO",
        version: "0.9.0",

        // PegÃ¡ aquÃ­ los dos valores pÃºblicos de Settings > API en Supabase.
        // La publishable key puede estar en el navegador; nunca uses la service_role key.
        supabaseUrl: "https://dxqaftxgbfibkocthkvr.supabase.co",
        supabasePublishableKey: "sb_publishable_uCyjn7gBOhKoizt-ao2W-g_mYcKrOoR",

        // Al iniciar sesiÃ³n por primera vez, los datos de la versiÃ³n anterior se
        // asignan a ese usuario y se sincronizan con su espacio personal.
        migrateLegacyDataOnFirstLogin: "confirm"
    };
})();
