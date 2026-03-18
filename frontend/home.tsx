import * as preact from "preact";
import * as rpc from "vlens/rpc";

type Data = {};

export async function fetch(route: string, prefix: string) {
    return rpc.ok<Data>({});
}

export function view(
    route: string,
    prefix: string,
    data: Data,
): preact.ComponentChild {
    return (
        <div>
            <h1>Chess Stats</h1>
            <p>Coming soon.</p>
        </div>
    );
}
