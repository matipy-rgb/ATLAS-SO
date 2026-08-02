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

    function workspaceCacheKey(userId) {
        return `atlas:workspace:${userId}`;
    }

    function hrAdminCacheKey(userId) {
        return `atlas:hr-admin:${userId}`;
    }

    function readCachedWorkspace(userId) {
        try {
            const cached = JSON.parse(localStorage.getItem(workspaceCacheKey(userId)) || "null");
            return cached?.id ? cached : null;
        } catch {
            return null;
        }
    }

    function cacheWorkspace(userId, workspace) {
        localStorage.setItem(workspaceCacheKey(userId), JSON.stringify(workspace));
        return workspace;
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
        const cached = readCachedWorkspace(session.user.id);

        const { data, error } = await client
            .from("workspace_members")
            .select("workspace_id, role, workspaces(id, name, slug)")
            .eq("user_id", session.user.id)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();

        if (error) {
            if (cached) {
                currentWorkspace = cached;
                return currentWorkspace;
            }
            throw error;
        }
        if (!data) {
            const { data: createdId, error: createError } = await client.rpc(
                "create_personal_workspace"
            );
            if (createError) throw createError;
            currentWorkspace = cacheWorkspace(session.user.id, {
                id: createdId,
                name: "Mi espacio",
                role: "owner"
            });
            return currentWorkspace;
        }

        currentWorkspace = cacheWorkspace(session.user.id, {
            id: data.workspace_id,
            name: data.workspaces?.name || "Mi espacio",
            slug: data.workspaces?.slug || "",
            role: data.role || "member"
        });
        return currentWorkspace;
    }

    async function signOut() {
        const userId = currentSession?.user?.id;
        if (client) await client.auth.signOut();
        currentSession = null;
        currentWorkspace = null;
        hrAdmin = null;
        if (userId) {
            localStorage.removeItem(workspaceCacheKey(userId));
            localStorage.removeItem(hrAdminCacheKey(userId));
        }
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
            hrAdmin = localStorage.getItem(hrAdminCacheKey(session.user.id)) === "true";
            return hrAdmin;
        }
        hrAdmin = data === true;
        localStorage.setItem(hrAdminCacheKey(session.user.id), String(hrAdmin));
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
