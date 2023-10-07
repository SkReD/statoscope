import { API } from '@statoscope/types/types/validation/api';

export type RuleDataInput<TInput> = TInput;

export type Rule<TParams, TInput> = (
  params: TParams | null,
  data: RuleDataInput<TInput>,
  api: API,
) => void;
