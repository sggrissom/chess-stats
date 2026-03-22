import * as rpc from "vlens/rpc"

export interface CreateAccountRequest {
    name: string
    email: string
    password: string
    confirmPassword: string
}

export interface CreateAccountResponse {
    success: boolean
    error: string
    token: string
    auth: AuthResponse
}

export interface Empty {
}

export interface AuthResponse {
    id: number
    name: string
    email: string
    isAdmin: boolean
}

export interface SetChessUsernameRequest {
    chesscomUsername: string
}

export interface SetChessUsernameResponse {
    success: boolean
    error: string
}

export interface GetChessProfileResponse {
    chesscomUsername: string
    gameCount: number
}

export interface SyncGamesResponse {
    success: boolean
    error: string
    newGamesAdded: number
    totalGames: number
}

export interface GetGameStatsResponse {
    overall: TimeClassRecord
    byClass: Record<string, TimeClassRecord>
}

export interface GetOpeningStatsRequest {
    timeClass: string
}

export interface GetOpeningStatsResponse {
    byOpening: Record<string, OpeningRecord>
}

export interface TimeClassRecord {
    wins: number
    losses: number
    draws: number
}

export interface OpeningRecord {
    eco: string
    asWhite: ColorRecord
    asBlack: ColorRecord
    variations: Record<string, VariationRecord>
}

export interface ColorRecord {
    wins: number
    losses: number
    draws: number
}

export interface VariationRecord {
    asWhite: ColorRecord
    asBlack: ColorRecord
}

export async function CreateAccount(data: CreateAccountRequest): Promise<rpc.Response<CreateAccountResponse>> {
    return await rpc.call<CreateAccountResponse>('CreateAccount', JSON.stringify(data));
}

export async function GetAuthContext(data: Empty): Promise<rpc.Response<AuthResponse>> {
    return await rpc.call<AuthResponse>('GetAuthContext', JSON.stringify(data));
}

export async function SetChessUsername(data: SetChessUsernameRequest): Promise<rpc.Response<SetChessUsernameResponse>> {
    return await rpc.call<SetChessUsernameResponse>('SetChessUsername', JSON.stringify(data));
}

export async function GetChessProfile(data: Empty): Promise<rpc.Response<GetChessProfileResponse>> {
    return await rpc.call<GetChessProfileResponse>('GetChessProfile', JSON.stringify(data));
}

export async function SyncGames(data: Empty): Promise<rpc.Response<SyncGamesResponse>> {
    return await rpc.call<SyncGamesResponse>('SyncGames', JSON.stringify(data));
}

export async function GetGameStats(data: Empty): Promise<rpc.Response<GetGameStatsResponse>> {
    return await rpc.call<GetGameStatsResponse>('GetGameStats', JSON.stringify(data));
}

export async function GetOpeningStats(data: GetOpeningStatsRequest): Promise<rpc.Response<GetOpeningStatsResponse>> {
    return await rpc.call<GetOpeningStatsResponse>('GetOpeningStats', JSON.stringify(data));
}

