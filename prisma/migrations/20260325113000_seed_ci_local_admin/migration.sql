-- Seed local CI admin user for API tests
-- Idempotent: safe to run multiple times

INSERT INTO "Usuario" (
  "id",
  "nome",
  "email",
  "senha",
  "perfil",
  "status"
)
VALUES (
  '6f8a73ba-c0f7-4950-82df-9d76e5904b0d',
  'Admin Teste',
  'admin@teste.local',
  '$2b$10$qmRIuzVTrT8epE2rDlbrmOGLg1B4d1eVpVNsijtQU1lWyvp8A4iym',
  'ADMIN',
  true
)
ON CONFLICT ("email") DO UPDATE
SET
  "nome" = EXCLUDED."nome",
  "senha" = EXCLUDED."senha",
  "perfil" = EXCLUDED."perfil",
  "status" = EXCLUDED."status";
