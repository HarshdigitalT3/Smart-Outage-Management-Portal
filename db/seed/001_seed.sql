INSERT INTO app_users (id, email, password, role)
VALUES ('00000000-0000-0000-0000-000000000001', 'operator@test.com', 'password', 'operator')
ON CONFLICT (email) DO NOTHING;

INSERT INTO app_users (id, email, password, role)
VALUES ('00000000-0000-0000-0000-000000000002', 'crew@test.com', 'password', 'crew')
ON CONFLICT (email) DO NOTHING;

INSERT INTO app_users (id, email, password, role)
VALUES ('00000000-0000-0000-0000-000000000003', 'customer@test.com', 'password', 'customer')
ON CONFLICT (email) DO NOTHING;
