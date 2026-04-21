import "@app/styles/global";
import * as vlens from "vlens";

async function main() {
    vlens.initRoutes([
        vlens.routeHandler("/login", () => import("@app/pages/auth/login")),
        vlens.routeHandler("/create-account", () => import("@app/pages/auth/create-account")),
        vlens.routeHandler("/dashboard/stats", () => import("@app/pages/dashboard/stats")),
        vlens.routeHandler("/dashboard/openings", () => import("@app/pages/dashboard/openings")),
        vlens.routeHandler("/dashboard/games", () => import("@app/pages/dashboard/games")),
        vlens.routeHandler("/dashboard/opponents", () => import("@app/pages/dashboard/opponents")),
        vlens.routeHandler("/dashboard", () => import("@app/pages/dashboard/index")),
        vlens.routeHandler("/game", () => import("@app/pages/game")),
        vlens.routeHandler("/", () => import("@app/home")),
    ]);
}

main();
