package backend

import (
	"chess/cfg"
	"errors"
	"time"

	"go.hasen.dev/vbeam"
	"go.hasen.dev/vbolt"
	"go.hasen.dev/vpack"
	"golang.org/x/crypto/bcrypt"
)

func RegisterUserMethods(app *vbeam.Application) {
	vbeam.RegisterProc(app, CreateAccount)
	vbeam.RegisterProc(app, GetAuthContext)
}

// Request/Response types
type CreateAccountRequest struct {
	Name            string `json:"name"`
	Email           string `json:"email"`
	Password        string `json:"password"`
	ConfirmPassword string `json:"confirmPassword"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type CreateAccountResponse struct {
	Success bool         `json:"success"`
	Error   string       `json:"error,omitempty"`
	Token   string       `json:"token,omitempty"`
	Auth    AuthResponse `json:"auth,omitempty"`
}

type LoginResponse struct {
	Success bool         `json:"success"`
	Error   string       `json:"error,omitempty"`
	Token   string       `json:"token,omitempty"`
	Auth    AuthResponse `json:"auth,omitempty"`
}

type AuthResponse struct {
	Id      int    `json:"id"`
	Name    string `json:"name"`
	Email   string `json:"email"`
	IsAdmin bool   `json:"isAdmin"`
}

// Database types
type User struct {
	Id        int       `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Creation  time.Time `json:"creation"`
	LastLogin time.Time `json:"lastLogin"`
}

// Packing functions for vbolt serialization
func PackUser(self *User, buf *vpack.Buffer) {
	vpack.Version(1, buf)
	vpack.Int(&self.Id, buf)
	vpack.String(&self.Name, buf)
	vpack.String(&self.Email, buf)
	vpack.Time(&self.Creation, buf)
	vpack.Time(&self.LastLogin, buf)
}

// Buckets for vbolt database storage
var UsersBkt = vbolt.Bucket(&cfg.Info, "users", vpack.FInt, PackUser)

// user id => hashed password
var PasswdBkt = vbolt.Bucket(&cfg.Info, "passwd", vpack.FInt, vpack.ByteSlice)

// email => user id
var EmailBkt = vbolt.Bucket(&cfg.Info, "email", vpack.StringZ, vpack.Int)

// Database helper functions
func GetUserId(tx *vbolt.Tx, email string) (userId int) {
	vbolt.Read(tx, EmailBkt, email, &userId)
	return
}

func GetUser(tx *vbolt.Tx, userId int) (user User) {
	vbolt.Read(tx, UsersBkt, userId, &user)
	return
}

func GetPassHash(tx *vbolt.Tx, userId int) (hash []byte) {
	vbolt.Read(tx, PasswdBkt, userId, &hash)
	return
}

func AddUserTx(tx *vbolt.Tx, req CreateAccountRequest, hash []byte) User {
	var user User
	user.Id = vbolt.NextIntId(tx, UsersBkt)
	user.Name = req.Name
	user.Email = req.Email
	user.Creation = time.Now()
	user.LastLogin = time.Now()

	vbolt.Write(tx, UsersBkt, user.Id, &user)
	vbolt.Write(tx, PasswdBkt, user.Id, &hash)
	vbolt.Write(tx, EmailBkt, user.Email, &user.Id)

	return user
}

func GetAuthResponseFromUser(user User) AuthResponse {
	return AuthResponse{
		Id:      user.Id,
		Name:    user.Name,
		Email:   user.Email,
		IsAdmin: user.Id == 1, // First user is admin
	}
}

type Empty struct{}

// vbeam procedures
func CreateAccount(ctx *vbeam.Context, req CreateAccountRequest) (resp CreateAccountResponse, err error) {
	if err = validateCreateAccountRequest(req); err != nil {
		resp.Success = false
		resp.Error = err.Error()
		return
	}

	userId := GetUserId(ctx.Tx, req.Email)
	if userId != 0 {
		resp.Success = false
		resp.Error = "Email already registered"
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		resp.Success = false
		resp.Error = "Failed to process password"
		return
	}

	vbeam.UseWriteTx(ctx)
	user := AddUserTx(ctx.Tx, req, hash)
	vbolt.TxCommit(ctx.Tx)

	resp.Success = true
	resp.Auth = GetAuthResponseFromUser(user)
	tokenString, tokenErr := generateJwtTokenString(user)
	if tokenErr == nil {
		resp.Token = tokenString
	}
	return
}

func GetAuthContext(ctx *vbeam.Context, req Empty) (resp AuthResponse, err error) {
	user, authErr := GetAuthUser(ctx)
	if authErr == nil && user.Id > 0 {
		resp = GetAuthResponseFromUser(user)
	}
	return
}

func validateCreateAccountRequest(req CreateAccountRequest) error {
	if req.Name == "" {
		return errors.New("Name is required")
	}
	if req.Email == "" {
		return errors.New("Email is required")
	}
	if req.Password != "" {
		if len(req.Password) < 8 {
			return errors.New("Password must be at least 8 characters")
		}
		if req.Password != req.ConfirmPassword {
			return errors.New("Passwords do not match")
		}
	}
	return nil
}
