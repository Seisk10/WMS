export type UserRole = 'OPERADOR' | 'SUPERVISOR' | 'ADMIN';

export type MovementType = 'ENTRADA' | 'SAIDA' | 'TRANSFERENCIA';

export type CountSessionStatus = 'ABERTA' | 'EM_ANDAMENTO' | 'AGUARDANDO_REVISAO' | 'ENCERRADA';

export type DivergenceSeverity = 'OK' | 'ATENCAO' | 'CRITICO';

export type DivergenceStatus = 'PENDENTE' | 'APROVADA' | 'REJEITADA';

export interface ApiResponse<T = unknown> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export interface AuthPayload {
  userId: number;
  role: UserRole;
}
