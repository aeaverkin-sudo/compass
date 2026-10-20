-- Signup writes that POST /api/signup already performs.
-- Run in the Supabase SQL editor when you want the same steps as one function.
-- The app does not call this function. Auth user creation stays outside SQL.

create or replace function public.signup_portfolio(
  p_user uuid,
  p_card uuid,
  p_name text,
  p_order text[],
  p_labels jsonb,
  p_token text,
  p_handle text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, registered_at)
  values (p_user, now())
  on conflict (id) do update set registered_at = now();

  insert into public.cards (
    id, owner_id, display_name, title, status, public_token, handle,
    qr_version, is_public, is_primary, listed, rubric_order, rubric_labels,
    created_at, updated_at
  ) values (
    p_card, p_user, p_name, '', 'published', p_token, p_handle,
    1, true, true, true, p_order, p_labels, now(), now()
  );
end;
$$;
