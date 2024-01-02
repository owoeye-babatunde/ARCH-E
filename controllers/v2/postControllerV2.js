import Post from "../../models/postModel.js";
import User from "../../models/userModel.js";
import Reply from "../../models/replyModel.js";
import postValidation from "../../validatiors/v2/post.validators.js";
import { createPostServiceV2  , getFeedPostServiceV2} from "../../services/v2/post.services.js"

const createPostV2 = async(req, res) => {
    try {
        const { 
            text , audio
        } = req.body;


        const userInfo = req.user;


        const JoiSchema = postValidation.createPost;
        await JoiSchema.validateAsync({
            text , audio
        });

        res.status(200).json(
            await createPostServiceV2( userInfo , text , audio )
        )


    } 
    catch (err) {
        // console.log({err})
        const { status } = err;
        const s = status ? status : 500;
        res.status(s).send({
          success: err.success,
          error: err.message,
        });
    

    }
};


const getFeedPostsV2 = async(req , res)=>{
    try {
        let userId = req.params.id  // Set userId to null if id is not provided
        
        let { page , limit } = req.query;

        page = page ? page == 0 ? 1 : page  : 1;
        limit =  limit ? limit  : 20
        page = parseInt(page);
        limit = parseInt(limit)

        const JoiSchema = postValidation.getFeedPosts;
        await JoiSchema.validateAsync({
            userId, page, limit
        });

        res.status(200).json(await getFeedPostServiceV2(userId , page , limit))


    } 
    catch (err) {
        console.log(err)
        const { status } = err;
        const s = status ? status : 500;
        res.status(s).send({
          success: err.success,
          error: err.message,
        });
    

    }

}


export { 
    createPostV2,
    getFeedPostsV2
};