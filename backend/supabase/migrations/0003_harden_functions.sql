-- Pin search_path on trigger functions (Supabase security advisor: function_search_path_mutable).
alter function public.touch_updated_at()      set search_path = '';
alter function public.guard_profile_update()  set search_path = '';
