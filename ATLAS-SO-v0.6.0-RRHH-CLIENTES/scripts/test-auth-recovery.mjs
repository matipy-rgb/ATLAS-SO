import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

class FakeElement {
    constructor(id = "") {
        this.id = id;
        this.textContent = "";
        this.className = "";
        this.hidden = false;
        this.disabled = false;
        this.dataset = {};
        this.value = "";
        this.type = "text";
        this.listeners = {};
        this.controls = [];
        this.submitButton = null;
        this.classList = { toggle() {} };
    }

    addEventListener(type, listener) {
        this.listeners[type] = listener;
    }

    querySelector(selector) {
        if (selector === 'button[type="submit"]') return this.submitButton;
        return null;
    }

    querySelectorAll(selector) {
        return selector === "button, input" ? this.controls : [];
    }

    setAttribute(name, value) {
        this[name] = value;
    }

    toggleAttribute(name, force) {
        this[name] = Boolean(force);
    }

    focus() {}

    reset() {
        this.controls.forEach(control => {
            if (control.id?.includes("Email")) control.value = "";
        });
    }
}

function makeForm(id, controls) {
    const form = new FakeElement(id);
    const submit = new FakeElement(`${id}Submit`);
    submit.textContent = "Enviar enlace de recuperación";
    submit.dataset = {};
    form.submitButton = submit;
    form.controls = [...controls, submit];
    return form;
}

const message = new FakeElement("authMessage");
const forgotEmail = new FakeElement("forgotEmail");
const loginEmail = new FakeElement("loginEmail");
const loginPassword = new FakeElement("loginPassword");
const registerName = new FakeElement("registerName");
const registerEmail = new FakeElement("registerEmail");
const registerPassword = new FakeElement("registerPassword");
const resetPassword = new FakeElement("resetPassword");
const resetPasswordConfirm = new FakeElement("resetPasswordConfirm");
const loginForm = makeForm("loginForm", [loginEmail, loginPassword]);
const registerForm = makeForm("registerForm", [registerName, registerEmail, registerPassword]);
const forgotForm = makeForm("forgotForm", [forgotEmail]);
const resetForm = makeForm("resetForm", [resetPassword, resetPasswordConfirm]);
const setupNotice = new FakeElement("setupNotice");
const authTitle = new FakeElement("authTitle");
const authSubtitle = new FakeElement("authSubtitle");
const tabs = new FakeElement("authTabs");

const byId = new Map([
    ["#authMessage", message], ["#setupNotice", setupNotice],
    ["#loginForm", loginForm], ["#registerForm", registerForm], ["#forgotForm", forgotForm], ["#resetForm", resetForm],
    ["#loginEmail", loginEmail], ["#loginPassword", loginPassword],
    ["#registerName", registerName], ["#registerEmail", registerEmail], ["#registerPassword", registerPassword],
    ["#forgotEmail", forgotEmail], ["#resetPassword", resetPassword], ["#resetPasswordConfirm", resetPasswordConfirm],
    ["#authTitle", authTitle], ["#authSubtitle", authSubtitle]
]);

const resetResponses = {
    "empty@atlas.test": { error: { message: "{}" } },
    "rate@atlas.test": { error: { message: "Too many emails", code: "over_email_send_rate_limit", status: 429 } },
    "ok@atlas.test": { data: {}, error: null }
};

const windowObject = {
    AtlasAuth: {
        isConfigured: () => true,
        getSession: async () => null,
        redirectUrl: file => `http://127.0.0.1:5500/${file}`,
        client: {
            auth: {
                signInWithPassword: async () => ({ error: null }),
                signUp: async () => ({ data: { session: null }, error: null }),
                resetPasswordForEmail: async email => resetResponses[email],
                updateUser: async () => ({ error: null }),
                signOut: async () => ({ error: null })
            }
        }
    },
    setTimeout,
    clearTimeout
};

const context = {
    window: windowObject,
    document: {
        body: { dataset: { authPage: "login" } },
        querySelector(selector) {
            if (byId.has(selector)) return byId.get(selector);
            if (selector === ".auth-tabs") return tabs;
            if (selector.includes('data-auth-form="forgot"')) return forgotEmail;
            if (selector.includes('data-auth-form="login"')) return loginEmail;
            if (selector.includes('data-auth-form="register"')) return registerName;
            return null;
        },
        querySelectorAll(selector) {
            if (selector === "[data-auth-form]") return [loginForm, registerForm, forgotForm];
            if (selector === ".auth-form input, .auth-form button") {
                return [...loginForm.controls, ...registerForm.controls, ...forgotForm.controls];
            }
            return [];
        }
    },
    navigator: {},
    location: {
        search: "",
        protocol: "http:",
        replace() {}
    },
    URL,
    URLSearchParams,
    console,
    setTimeout,
    clearTimeout
};

vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL("../auth-page.js", import.meta.url), "utf8"), context);

async function submit(email) {
    forgotEmail.value = email;
    await forgotForm.listeners.submit({ preventDefault() {}, currentTarget: forgotForm });
    assert.equal(forgotForm.submitButton.disabled, false, "El botón debe volver a habilitarse");
}

await submit("empty@atlas.test");
assert.match(message.textContent, /Supabase no pudo enviar el correo/);
assert.match(message.className, /error/);

await submit("rate@atlas.test");
assert.match(message.textContent, /Esperá unos minutos/);
assert.match(message.className, /error/);

await submit("ok@atlas.test");
assert.match(message.textContent, /el enlace llegará en breve/);
assert.match(message.className, /success/);

console.log("ATLAS SO: recuperación probada con éxito, límite y error vacío.");
