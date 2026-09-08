-- Synthetic disposable fixture only. It is intentionally smaller than the application schema.
CREATE TABLE "__SCHEMA__".auth_users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_setup_required boolean NOT NULL DEFAULT true
);

CREATE TABLE "__SCHEMA__".evaluations (
  id uuid PRIMARY KEY,
  employee_id uuid NOT NULL,
  evaluator_id uuid,
  status text NOT NULL CHECK (status IN ('draft', 'submitted')),
  score numeric(5, 2)
);

CREATE TABLE "__SCHEMA__".evaluation_rounds (
  id uuid PRIMARY KEY,
  evaluation_id uuid NOT NULL REFERENCES "__SCHEMA__".evaluations(id),
  round_number integer NOT NULL CHECK (round_number > 0),
  evaluator_id uuid,
  status text NOT NULL CHECK (status IN ('open', 'closed'))
);
