-- Migration : Ajouter les télépros Raphaël et Lirone
-- À exécuter dans Supabase → SQL Editor

-- 1. Colonnes d'assignation CRM (si pas déjà présentes)
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS assigned_to text;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS assigned_name text;

-- 2. Ajouter les télépros dans admins
INSERT INTO admins (email, role) VALUES
  ('raphael@edumove.fr', 'telepro'),
  ('lirone@edumove.fr', 'telepro');
-- Si erreur "duplicate key" (emails déjà présents), exécuter à la place :
-- UPDATE admins SET role = 'telepro' WHERE email IN ('raphael@edumove.fr', 'lirone@edumove.fr');

-- 3. IMPORTANT : Créer les comptes Supabase Auth pour raphael@edumove.fr et lirone@edumove.fr
--    via Supabase Dashboard → Authentication → Users → Add user (invite par email)
