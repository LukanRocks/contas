-- Runs once, when the db volume is first initialised: the disposable database
-- the test suite migrates and rolls back against (DATABASE_URL_TEST).
CREATE DATABASE contas_test;
