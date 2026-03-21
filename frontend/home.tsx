import * as preact from "preact";
import * as rpc from "vlens/rpc";
import * as core from "vlens/core";
import * as auth from "./lib/authCache";
import { ensureNoAuthInFetch } from "./lib/authHelpers";

type Data = {};

export async function fetch(route: string, prefix: string) {
    if (!(await ensureNoAuthInFetch())) {
        return rpc.ok<Data>({});
    }
    return rpc.ok<Data>({});
}

export function view(
    route: string,
    prefix: string,
    data: Data,
): preact.ComponentChild {
    const currentAuth = auth.getAuth();
    if (currentAuth && currentAuth.id > 0) {
        core.setRoute("/dashboard");
        return null;
    }

    return (
        <div>
            <h1>Chess Stats</h1>
            <p>Coming soon.</p>
            <p>
                <a href="/create-account">Create account</a> · <a href="/login">Sign in</a>
            </p>
        </div>
    );
}
