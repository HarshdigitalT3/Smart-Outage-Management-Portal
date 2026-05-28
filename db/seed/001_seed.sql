-- Seed users with bcrypt-hashed passwords.
-- The hash below is bcryptjs.hashSync("password", 12)
-- NOTE: keep this seed in sync with backend bcrypt cost (default 12) for local/dev usage.
INSERT INTO app_users (id, email, password, role)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'operator@test.com',
  '$2a$12$z7Jc7Yj1oG0s6ZVhPpXj6eQw6hFZqQp3L8iA7yTQp9JrJgq9dJr0e',
  'operator'
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO app_users (id, email, password, role)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'crew@test.com',
  '$2a$12$z7Jc7Yj1oG0s6ZVhPpXj6eQw6hFZqQp3L8iA7yTQp9JrJgq9dJr0e',
  'crew'
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO app_users (id, email, password, role)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  'customer@test.com',
  '$2a$12$z7Jc7Yj1oG0s6ZVhPpXj6eQw6hFZqQp3L8iA7yTQp9JrJgq9dJr0e',
  'customer'
)
ON CONFLICT (email) DO NOTHING;
