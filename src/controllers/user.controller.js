import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken"

const registerUser = asyncHandler( async(req, res) => {
    
    // get user details from frontend
    // validation
    // check if user already exists
    // check for images , check for avatar
    // upload them to cloudinary, avatar
    // create user object - create entry in db
    // remove password and refresh token field from response
    //check for user creation
    // return res

    const {email, fullname, username, password} = req.body
    // if (fullname === ""){
    //     throw new ApiError(400,  "FullName is required")
    // }
    if (
        [email, fullname, username, password].some((field) => field?.trim() === "")
    ) {
        throw new ApiError(400, "All Fields are required")
    }
    const existedUser = await User.findOne({
        $or: [{ username },{ email }]
    })
    if (existedUser) {
        throw new ApiError (409, "User with email or username already exists")
    }
    // console.log(req.files)

    const avatarLocalPath = req.files?.avatar[0]?.path;
    // const coverImageLocalPath = req.files?.coverImage[0]?.path;
    let coverImageLocalPath;
    if( req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
        coverImageLocalPath = req.files.coverImage[0].path
    }

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is required")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if(!avatar) {
        throw new  ApiError(400, "Avatar file is required ")
    }

    const user = await User.create({
        fullname,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase()
    })

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )
    if (!createdUser) {
        throw new ApiError(500, "something went wrong while registering the user")
    }

    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered Successfully ")
    )
})
const loginUser = asyncHandler ( async ( req, res ) => {
    // req body => data
    // ask for email/username and pasword
    // find the user
    // password check
    // access and refresh token
    // send cookie
    //response
    
    const {email, username, password} = req.body

    const genrateAccessTAndRefersh = async (userId) => {
        try {
            const user = await User.findById(userId)
            const accessToken = user.genrateAccessToken()
            const refreshToken = user.genrateRefreshToken()

            user.refreshToken = refreshToken
            await user.save({ validateBeforeSave: false })

            return { accessToken, refreshToken }
        } catch (error) {
            throw new ApiError(500, "Something went wrong while genrating Access and Refresh Token")
        }
    }

    if (!(username || email)) {
        throw new ApiError(400, "Email or username required!! ")
    }

    const user = await  User.findOne({
        $or: [{username}, {email}]
    })
    if(!user) {
        throw new ApiError(404, "User does not exist.")
    }
    const isPasswordValid = await user.isPasswordCorrect(password)

    if(!isPasswordValid) {
        throw new ApiError(401, "Password is not correct")
    }

    const { accessToken, refreshToken } = await genrateAccessTAndRefersh(user._id)

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    const options = {
        httpOnly: true,
        secure: true
    }

    return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
        new ApiResponse(200, {
            user: loggedInUser, accessToken, refreshToken
        }, 
        " User Logged In Succesfully ")
    )

})
const logOutUser = asyncHandler ( async(req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken: undefined
            }
        },
        {
            new: true
        }
    )
    const options = {
        httpOnly: true,
        secure: true
    }

    return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User Logged Out"))
})
const refreshAccessToken = asyncHandler ( async ( req, res ) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if (!incomingRefreshToken) {
        throw new ApiError(401, "Unauthorized Request")
    }

   try {
     const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)
     
     const user = await User.findById(decodedToken?._id)
 
     if(!user) {
         throw new error (401, "Invaild Request")
     }
 
     if(incomingRefreshToken !== user?.refreshToken) {
         throw new ApiError(401, "Refresh Token Expired or Used")
     }
 
     const options = {
         httpOnly: true,
         secure: true
     }
 
     const {accessToken, newRefreshToken} = await genrateAccessTAndRefersh(user._id)
 
     return res
     .status(200)
     .cookie("accessToken", accessToken, options)
     .cookie("refreshToken", newRefreshToken, options)
     .json(
         new ApiResponse (
             200,
             {
                 accessToken, refreshToken: newRefreshToken
             }, "Access Token Refreshed"
         )
     )
   } catch (error) {
        throw new ApiError(401, error?.message || "Invaild refresh Token ")
   }
} )

export { registerUser, loginUser, logOutUser, refreshAccessToken}