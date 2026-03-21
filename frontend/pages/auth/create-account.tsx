import * as preact from "preact";
import * as vlens from "vlens";
import * as rpc from "vlens/rpc";
import * as core from "vlens/core";
import * as auth from "../../lib/authCache";
import * as server from "../../server";

type CreateAccountForm = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  error: string;
  loading: boolean;
};

type Data = {};

const useCreateAccountForm = vlens.declareHook(
  (): CreateAccountForm => ({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    error: "",
    loading: false,
  })
);

export async function fetch(route: string, prefix: string) {
  return rpc.ok<Data>({});
}

export function view(route: string, prefix: string, data: Data): preact.ComponentChild {
  const form = useCreateAccountForm();
  return <CreateAccountPage form={form} />;
}

async function onCreateAccountClicked(form: CreateAccountForm, event: Event) {
  event.preventDefault();
  form.loading = true;
  form.error = "";

  let [resp, err] = await server.CreateAccount({
    name: form.name,
    email: form.email,
    password: form.password,
    confirmPassword: form.confirmPassword,
  });

  form.loading = false;

  if (resp && resp.success) {
    rpc.setAuthHeaders({ "x-auth-token": resp.token });
    auth.setAuth(resp.auth);
    core.setRoute("/dashboard");
  } else {
    form.error = resp?.error || err || "Failed to create account";
  }
  vlens.scheduleRedraw();
}

interface CreateAccountPageProps {
  form: CreateAccountForm;
}

const CreateAccountPage = ({ form }: CreateAccountPageProps) => (
  <div class="create-account-page">
    <div class="auth-card">
      <div class="auth-header">
        <h1>Chess Stats</h1>
        <p>Create your account</p>
      </div>

      {form.error && <div class="error-message">{form.error}</div>}

      <form class="auth-form" onSubmit={vlens.cachePartial(onCreateAccountClicked, form)}>
        <div class="form-group">
          <label htmlFor="name">Full Name</label>
          <input
            type="text"
            id="name"
            placeholder="Enter your full name"
            {...vlens.attrsBindInput(vlens.ref(form, "name"))}
            required
            disabled={form.loading}
          />
        </div>

        <div class="form-group">
          <label htmlFor="email">Email Address</label>
          <input
            type="email"
            id="email"
            placeholder="Enter your email"
            {...vlens.attrsBindInput(vlens.ref(form, "email"))}
            required
            disabled={form.loading}
          />
        </div>

        <div class="form-group">
          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            placeholder="Create a password (min 8 chars)"
            {...vlens.attrsBindInput(vlens.ref(form, "password"))}
            required
            disabled={form.loading}
          />
        </div>

        <div class="form-group">
          <label htmlFor="confirmPassword">Confirm Password</label>
          <input
            type="password"
            id="confirmPassword"
            placeholder="Confirm your password"
            {...vlens.attrsBindInput(vlens.ref(form, "confirmPassword"))}
            required
            disabled={form.loading}
          />
        </div>

        <button
          type="submit"
          class="btn btn-primary btn-large auth-submit"
          disabled={form.loading}
        >
          {form.loading ? "Creating..." : "Create Account"}
        </button>
      </form>

      <div class="auth-footer">
        <p>
          Already have an account?{" "}
          <a href="/login" class="auth-link">
            Sign in
          </a>
        </p>
      </div>
    </div>
  </div>
);
