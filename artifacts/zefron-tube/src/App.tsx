import { Route, Switch, Router as WouterRouter } from "wouter";
import { Header, SideRail, MobileTabBar } from "./components/Header";
import { PlayerHost } from "./components/PlayerHost";
import { HomePage } from "./pages/Home";
import { WatchPage } from "./pages/Watch";
import { SearchPage } from "./pages/Search";
import { LikedPage } from "./pages/Liked";
import { HistoryPage } from "./pages/History";

function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto flex max-w-[1600px] gap-0 px-0 pb-20 pt-4 sm:px-4 sm:pb-24 sm:pt-6 lg:gap-6 lg:px-6">
          <SideRail />
          <main className="min-w-0 flex-1 px-3 sm:px-0">
            <Switch>
              <Route path="/" component={HomePage} />
              <Route path="/watch" component={WatchPage} />
              <Route path="/search" component={SearchPage} />
              <Route path="/liked" component={LikedPage} />
              <Route path="/history" component={HistoryPage} />
              <Route>
                <div className="py-20 text-center text-muted-foreground">Page not found.</div>
              </Route>
            </Switch>
          </main>
        </div>
        <MobileTabBar />
        <PlayerHost />
      </div>
    </WouterRouter>
  );
}

export default App;
