(function () {
    const config = window.ATLAS_CONFIG || {};
    const hasCredentials = Boolean(
        /^https:\/\/.+\.supabase\.co$/i.test(String(config.supabaseUrl || "").trim()) &&
        String(config.supabasePublishableKey || "").trim()
    );

    let client = null;
    let currentSession = null;
    let currentWorkspace = null;
    let hrAdmin = null;

    if (hasCredentials && window.supabase?.createClient) {
        client = window.supabase.createClient(
            config.supabaseUrl,
            config.supabasePublishableKey,
            {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true
                }
            }
        );
    }

    function redirectUrl(fileName) {
        return new URL(fileName, window.location.href).href;
    }

    async function getSession() {
        if (!client) return null;
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        currentSession = data.session || null;
        return currentSession;
    }

    async function getWorkspace() {
        if (currentWorkspace) return currentWorkspace;
        const session = currentSession || await getSession();
        if (!session) return null;

        const { data, error } = await client
            .from("workspace_members")
            .select("workspace_id, role, workspaces(id, name, slug)")
            .eq("user_id", session.user.id)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();

        if (error) throw error;
        if (!data) {
            const { data: createdId, error: createError } = await client.rpc(
                "create_personal_workspace"
            );
            if (createError) throw createError;
            currentWorkspace = {
                id: createdId,
                name: "Mi espacio",
                role: "owner"
            };
            return currentWorkspace;
        }

        currentWorkspace = {
            id: data.workspace_id,
            name: data.workspaces?.name || "Mi espacio",
            slug: data.workspaces?.slug || "",
            role: data.role || "member"
        };
        return currentWorkspace;
    }

    async function signOut() {
        if (client) await client.auth.signOut();
        currentSession = null;
        currentWorkspace = null;
        hrAdmin = null;
        localStorage.removeItem("atlasActiveUserId");
        localStorage.removeItem("atlasActiveWorkspaceId");
        window.location.replace("login.html");
    }

    async function isHRAdmin() {
        if (hrAdmin !== null) return hrAdmin;
        const session = currentSession || await getSession();
        if (!session || !client) return false;
        const { data, error } = await client.rpc("is_hr_admin");
        if (error) {
            console.warn("No se pudo verificar el permiso de RRHH:", error.message);
            hrAdmin = false;
            return false;
        }
        hrAdmin = data === true;
        return hrAdmin;
    }

    window.AtlasAuth = {
        client,
        config,
        isConfigured: () => hasCredentials,
        redirectUrl,
        getSession,
        getWorkspace,
        isHRAdmin,
        signOut,
        get session() { return currentSession; },
        get user() { return currentSession?.user || null; },
        get workspace() { return currentWorkspace; }
    };
})();
