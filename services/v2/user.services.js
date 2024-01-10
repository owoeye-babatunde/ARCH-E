import User from "../../models/userModel.js";
import { upload, s3 } from "../../db/bucketUploadClient.js";
import { sendOTP, makeid } from "../../utils/helpers/generateOTP.js"
import generateTokenAndSetCookie from "../../utils/helpers/generateTokenAndSetCookie.js";
import {
    hashPassword,
    validatePassword
} from "../../utils/helpers/passwordSettersAndValidators.js";
import { v4 as uuidv4 } from "uuid";
import { 
    formatUserData, 
    parsingBufferImage , 
    getRequest , 
    calculateAge ,
    prepareRedirectUrl
} from "../../utils/helpers/commonFuncs.js"



import { uploadFileToS3, deleteFileFromS3 } from "../../utils/helpers/fileUploads.js"

import { 
    updateRecord ,
    createRecord ,
    findRecordById , 
} from "../../utils/helpers/commonDbQueries.js";

import { google } from "googleapis";



const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URL = `${process.env.REDIRECT_BASE_URL}/api/v2/users/auth/google/callback`;

const oauth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URL
);
  
const scopes = [
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/user.birthday.read'
];





const signUpService = async (
    full_name,
    email, password,
    age, phone,
    profilePic, lat,
    long, ip
) => {
    let profPicLocation;
    const user = await User.findOne({ email });

    // check if user exists or not
    if (user) {
        throw {
            success: false,
            status: 400,
            message: "User already exists",
        };

    }

    // make email
    // let username = makeid(9)
    let username = email;

    password = hashPassword(password)

    // upload profile picture if provided
    if (profilePic) {

        let { fileName, type, buf } = parsingBufferImage(profilePic)

        profPicLocation = await uploadFileToS3(
            `${fileName.substr(fileName.length - 15)}.${type}`,
            buf, 'base64', `image/${type}`,
            process.env.S3BUCKET_PROFILEIMAGES, 'public-read'
        )

    }

    // add user to DB
    const newUser = new User({
        full_name: full_name,
        username: username, age: age, phone: phone,
        profilePic: profPicLocation, password: password,
        email: email, ip: ip, lat: lat, long: long
    });


    await newUser.save();
    if (newUser) {
        const token = await generateTokenAndSetCookie(newUser);

        formatUserData(newUser._doc)

        return {
            success: true,
            data: { ...newUser._doc },
            token,
            message: "Signed Up In Successfully"
        }


    }
    else {
        throw {
            success: false,
            status: 400,
            message: "Invalid user data",
        };
    }
};


const signInService = async (
    email, password,
) => {


    const user = await User.findOne({ email });

    // check if user exists or not
    if (!user) {
        throw {
            success: false,
            status: 404,
            message: "Email Not Found",
        };
    }

    if(user.google_access_token){
        const token = await generateTokenAndSetCookie(user);

        formatUserData(user._doc)

        return {
            success: true,
            data: { ...user._doc },
            token,
            message: "Logged In Successfully"
        }
    }

    if (validatePassword(user, password)) {
        const token = await generateTokenAndSetCookie(user);

        formatUserData(user._doc)

        return {
            success: true,
            data: { ...user._doc },
            token,
            message: "Logged In Successfully"
        }


    }
    else {
        throw {
            success: false,
            status: 400,
            message: "Password Incorrect",
        };
    }

};


const verifyAccessService = async (
    req,
) => {
    let userInfo = req.user._doc;
    let userToken = req.user.token;


    if (userInfo && userToken) {
        formatUserData(userInfo)


        return {
            success: true,
            data: { ...userInfo },
            token: userToken,
            message: "Logged In Successfully",
        };

    }

    throw {
        success: false,
        status: 404,
        message: "Record Not found",
    };



}

const updateUserService = async (
    userInfo, full_name, password,
    username, bio, age, profilePic
) => {

    let existingUsername;

    if (username) {
        username = username.toLowerCase();
        existingUsername = await User.findOne({ username });
    }

    if (existingUsername) {
        throw {
            success: false,
            status: 400,
            message: "Username already exist",
        }
    }

    // hash password if provided
    if (password) {
        password = hashPassword(password)
    }

    // upload profile picture if provided
    if (profilePic) {

        if (userInfo.profilePic) {
            let img = userInfo.profilePic.split(".com/")[1].split("/")[1];
            await deleteFileFromS3(img, process.env.S3BUCKET_PROFILEIMAGES)
        }

        let { fileName, type, buf } = parsingBufferImage(profilePic)


        profilePic = await uploadFileToS3(
            `${fileName.substr(fileName.length - 15)}.${type}`,
            buf, 'base64', `image/${type}`,
            process.env.S3BUCKET_PROFILEIMAGES, 'public-read',
        )
    }

    let updateData = {
        full_name, password, username,
        bio, age, profilePic
    }

    let filter = {
        _id: userInfo._id
    }

    let updateUser = await User.findOneAndUpdate(filter, updateData, { new: true });

    formatUserData(updateUser._doc)

    return {
        success: true,
        data: { ...updateUser._doc },
        message: "User updated Successfully",
    };

}



const followUnFollowServiceV2 = async (currentUser, targetUserId) => {
    
    if( currentUser._id.toString() === targetUserId){
        throw {
            success: false,
            status: 400,
            message: "User cannot follow/unFollow him self",
        }
    }

    const targetUser = await findRecordById( User , targetUserId , "Clicked User not found" )

    const followed = currentUser.following.includes( targetUserId );

    if (followed) {
        // Unfollow user
        
        await User.findByIdAndUpdate(targetUserId, { $pull: { followers: currentUser._id } });
        await User.findByIdAndUpdate(currentUser._id, { $pull: { following: targetUserId } });
        return {
            success: true,
            data: { followed : !followed },
            message: "User Un-Followed Successfully",
        };

    } else {
        // Follow user
        await User.findByIdAndUpdate(targetUserId, { $push: { followers: currentUser._id } });
        await User.findByIdAndUpdate(currentUser._id, { $push: { following: targetUserId } });
        return {
            success: true,
            data: { followed : !followed },
            message: "User Followed Successfully",
        };
    }

};


const gogogleAuthServiceV2 = async( )=>{
    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        include_granted_scopes: true
    });   

    
    return {
        success : true,
        message : "Auth Url Generated",
        data : { url }
    }    
    

}


const googleCallBackServiceV2 = async(code , ip)=>{        
        let url;
        let userAge;
        let { tokens } = await oauth2Client.getToken(code);
        const { access_token , refresh_token } = tokens;

        let profileUrl = "https://www.googleapis.com/oauth2/v1/userinfo";
        let ageUrl = `https://people.googleapis.com/v1/people/me?personFields=birthdays&key=${process.env.GOOGLE_API_KEY}`;
        let headers = { Authorization: `Bearer ${access_token}` };

        const profile = await getRequest( profileUrl , headers );
        const ageData = await getRequest( ageUrl , headers );
        const birthdays = ageData.birthdays;

        // console.log(birthdays)
        if(birthdays){
            let index;
            if( birthdays.length > 1 ){ index = 1 }
            else{ index = 0 };

            let year = birthdays[ index ].date.year;
            let month = birthdays[ index ].date.month;
            let day = birthdays[ index ].date.day;
            userAge = calculateAge(day , month , year);
        }

        try{

            let userPayload = {
                full_name: profile.name, username: profile.email , age: userAge,
                profilePic: profile.picture,email: profile.email, ip: ip, 
                google_access_token : access_token, google_refresh_token : refresh_token,
            }

            const newUser = await createRecord( User , userPayload)

            if (newUser) {
                const token = await generateTokenAndSetCookie(newUser);
    
                url = prepareRedirectUrl( 200 , token )
                return url;            
            }
            else {
                url = prepareRedirectUrl( 400 )
                return url;
            }    
        }
        catch(err){
            if(err.code === 11000){
                const user = await User.findOne({ email : profile.email });    

                // If user already exist update its google_access_token
                let updateData = {
                    google_access_token : access_token
                }
                let updateUser = await updateRecord( User , user._id , updateData )

                // ---------------------------------------------------- //
                
                const token = await generateTokenAndSetCookie(user);

                url = prepareRedirectUrl( 200 , token )
                return url;                            
            }
            else{
                url = prepareRedirectUrl( 400 )
                return url;
            }
        }
          
}


export {
    signUpService,
    signInService,
    verifyAccessService,
    updateUserService,
    followUnFollowServiceV2,
    gogogleAuthServiceV2,
    googleCallBackServiceV2
}