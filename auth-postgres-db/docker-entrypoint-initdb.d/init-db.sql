CREATE USER "schemavaults-auth-server-dev" WITH ENCRYPTED PASSWORD 'schemavaults-auth-server-dev';
CREATE DATABASE "schemavaults-auth-server-dev" OWNER "schemavaults-auth-server-dev";

GRANT ALL PRIVILEGES ON DATABASE "schemavaults-auth-server-dev" TO "schemavaults-auth-server-dev"

-- Connect to the new database to run the schema permission modification commands
\c "schemavaults-auth-server-dev"

-- Grant schema permissions
GRANT USAGE ON SCHEMA public TO "schemavaults-auth-server-dev";
GRANT CREATE ON SCHEMA public TO "schemavaults-auth-server-dev";

-- Grant default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "schemavaults-auth-server-dev";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "schemavaults-auth-server-dev";
