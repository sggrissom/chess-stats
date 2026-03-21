import * as vlens from "vlens";

async function main() {
    vlens.initRoutes([
        vlens.routeHandler("/login", () => import("@app/pages/auth/login")),
        vlens.routeHandler("/create-account", () => import("@app/pages/auth/create-account")),
        vlens.routeHandler("/", () => import("@app/home")),
    ]);
}

main();
