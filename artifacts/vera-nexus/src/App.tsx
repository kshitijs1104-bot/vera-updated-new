import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout/Layout";
import { CategoryProvider } from "@/lib/CategoryContext";
import { LinePage } from "@/pages/Line";
import { SightPage } from "@/pages/Sight";
import { CryptPage } from "@/pages/Crypt";
import { ThoughtsPage } from "@/pages/Thoughts";
import { VenusPage } from "@/pages/Venus";
import { SettingsPage } from "@/pages/Settings";
import { SignupGate } from "@/pages/enterprise/Signup";
import { OnboardingGate } from "@/pages/enterprise/Onboarding";
import { PlanGate } from "@/pages/enterprise/Plan";
import { CheckoutGate } from "@/pages/enterprise/Checkout";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/enterprise/signup" component={SignupGate} />
      <Route path="/enterprise/onboarding" component={OnboardingGate} />
      <Route path="/enterprise/plan" component={PlanGate} />
      <Route path="/enterprise/checkout" component={CheckoutGate} />
      <Route path="/">
        <Layout>
          <LinePage />
        </Layout>
      </Route>
      <Route path="/line">
        <Layout>
          <LinePage />
        </Layout>
      </Route>
      <Route path="/sight">
        <Layout>
          <SightPage />
        </Layout>
      </Route>
      <Route path="/crypt">
        <Layout>
          <CryptPage />
        </Layout>
      </Route>
      <Route path="/thoughts">
        <Layout>
          <ThoughtsPage />
        </Layout>
      </Route>
      <Route path="/venus">
        <Layout>
          <VenusPage />
        </Layout>
      </Route>
      <Route path="/settings">
        <Layout>
          <SettingsPage />
        </Layout>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <CategoryProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </CategoryProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
