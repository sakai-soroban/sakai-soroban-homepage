-- 本番適用後の権限確認用（読み取り専用）

-- 1. RLSが全対象テーブルで有効か
select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('profiles', 'students', 'absence_records', 'audit_logs', 'class_slots', 'notification_deliveries')
order by relname;

-- 2. 作成済みポリシー一覧
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles', 'students', 'absence_records', 'audit_logs', 'class_slots', 'notification_deliveries')
order by tablename, policyname;

-- 3. anonに業務テーブル権限が残っていないか（0行が正常）
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'anon'
  and table_name in ('profiles', 'students', 'absence_records', 'audit_logs', 'class_slots', 'notification_deliveries');

-- 4. 監査トリガーが存在するか
select event_object_table, trigger_name, event_manipulation
from information_schema.triggers
where trigger_schema = 'public'
  and trigger_name in ('audit_students_changes', 'audit_absence_changes', 'audit_class_slots_changes', 'absence_enforce_makeup_capacity')
order by event_object_table, event_manipulation;

-- 5. security definer関数のsearch_path確認
select n.nspname, p.proname, p.prosecdef, p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private'
  and p.proname in ('current_user_role', 'is_staff', 'is_admin', 'write_audit_log');

-- 実アカウントを使う侵入テスト:
-- A. 保護者AのJWTで /rest/v1/students を実行し、Aの子どもだけ返る
-- B. 保護者AのJWTでBのstudent_idをabsence_recordsへPOSTし、403になる
-- C. 保護者AのJWTでabsence_recordsをSELECTし、行が返らない
-- D. 先生JWTでstudentsをDELETEし、403になる
-- E. 管理者JWTでstudentsのCRUDが成功し、audit_logsへ記録される
-- F. 定員1名の同じclass_slotへ2件を同時送信し、片方だけ成功する
-- G. 保護者JWTでabsence_recordsへ直接INSERTし、権限エラーになる
-- H. 保護者JWTでavailable_makeup_slotsを実行し、人数集計だけ返り生徒情報が返らない
