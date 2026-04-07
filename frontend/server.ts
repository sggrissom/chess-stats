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

export interface GameFilter {
    timeClass: string
    minOpponentRating: number
    maxOpponentRating: number
    since: number
}

export interface GetGameStatsResponse {
    overall: TimeClassRecord
    byClass: Record<string, TimeClassRecord>
}

export interface GetOpeningStatsResponse {
    byOpening: Record<string, OpeningRecord>
}

export interface GetRecentGamesRequest {
    filter: GameFilter
    limit: number
    offset: number
}

export interface GetRecentGamesResponse {
    games: RecentGameItem[]
    total: number
}

export interface GetGameDetailRequest {
    gameId: string
}

export interface GetGameDetailResponse {
    game: RecentGameItem
    pgn: string
    analysisStatus: number
    analysisDepth: number
    whiteAccuracy: number
    blackAccuracy: number
    moves: MoveAnalysisItem[]
    errorMessage: string
    analyzedAt: number
}

export interface RequestGameAnalysisRequest {
    gameId: string
}

export interface RequestGameAnalysisResponse {
    queued: boolean
    status: number
    error: string
}

export interface RequestAllGameAnalysisRequest {
}

export interface RequestAllGameAnalysisResponse {
    queued: number
    error: string
}

export interface GetRatingHistoryResponse {
    points: RatingPoint[]
}

export interface GetWinRateTrendResponse {
    buckets: WinRateBucket[]
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

export interface RecentGameItem {
    id: string
    whiteUsername: string
    whiteRating: number
    blackUsername: string
    blackRating: number
    timeClass: string
    timeControl: string
    result: string
    userColor: string
    startTime: number
    opening: string
    openingEco: string
    analysisStatus: number
}

export interface MoveAnalysisItem {
    moveNumber: number
    color: string
    movePlayed: string
    bestMove: string
    evaluation: number
    isMate: boolean
    mateIn: number
    accuracy: number
    moveQuality: string
}

export interface RatingPoint {
    startTime: number
    rating: number
    result: string
    timeClass: string
}

export interface WinRateBucket {
    periodStart: number
    wins: number
    losses: number
    draws: number
}

export interface ColorRecord {
    wins: number
    losses: number
    draws: number
    openingEvalSum: number
    openingEvalN: number
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

export async function GetGameStats(data: GameFilter): Promise<rpc.Response<GetGameStatsResponse>> {
    return await rpc.call<GetGameStatsResponse>('GetGameStats', JSON.stringify(data));
}

export async function GetOpeningStats(data: GameFilter): Promise<rpc.Response<GetOpeningStatsResponse>> {
    return await rpc.call<GetOpeningStatsResponse>('GetOpeningStats', JSON.stringify(data));
}

export async function GetRecentGames(data: GetRecentGamesRequest): Promise<rpc.Response<GetRecentGamesResponse>> {
    return await rpc.call<GetRecentGamesResponse>('GetRecentGames', JSON.stringify(data));
}

export async function GetGameDetail(data: GetGameDetailRequest): Promise<rpc.Response<GetGameDetailResponse>> {
    return await rpc.call<GetGameDetailResponse>('GetGameDetail', JSON.stringify(data));
}

export async function RequestGameAnalysis(data: RequestGameAnalysisRequest): Promise<rpc.Response<RequestGameAnalysisResponse>> {
    return await rpc.call<RequestGameAnalysisResponse>('RequestGameAnalysis', JSON.stringify(data));
}

export async function RequestAllGameAnalysis(data: RequestAllGameAnalysisRequest): Promise<rpc.Response<RequestAllGameAnalysisResponse>> {
    return await rpc.call<RequestAllGameAnalysisResponse>('RequestAllGameAnalysis', JSON.stringify(data));
}

export async function GetRatingHistory(data: GameFilter): Promise<rpc.Response<GetRatingHistoryResponse>> {
    return await rpc.call<GetRatingHistoryResponse>('GetRatingHistory', JSON.stringify(data));
}

export async function GetWinRateTrend(data: GameFilter): Promise<rpc.Response<GetWinRateTrendResponse>> {
    return await rpc.call<GetWinRateTrendResponse>('GetWinRateTrend', JSON.stringify(data));
}

