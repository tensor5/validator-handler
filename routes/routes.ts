'use strict'

import dotenv  from "dotenv"
dotenv.config()

import express from 'express'
const router = express.Router()
import { succesResponse, errorResponse } from "../utils/response"
import { emptyBodyType, loginBodyType } from "../types/api-request-body"
import { successResponseType, errorResponseType } from "../types/api-response-body"
import { generate as jwtGenerate, verify as jwtVerify, refreshToken as jwtRefreshToken, getToken } from "../auth/jwt"
import { auth } from "../controller/userController"

router.post('/api/login/token', async (req: loginBodyType, res: successResponseType | errorResponseType) : Promise<void> => {
    try {
        const username: string = req.body.username
        const password: string = req.body.password

        if (!Boolean(username) || !Boolean(password)) {
            throw new Error('Empty username or password')
        }

        const userObj = await auth(username, password)
        const token   = await jwtGenerate(process.env.JWT_SECRET, userObj, Number(process.env.JWT_EXPIRATION_TIME))

        return succesResponse({
            token: token,
            expires_in: Number(process.env.JWT_EXPIRATION_TIME)
        }, res)
    } catch (error) {
        return errorResponse(0, error, 401, res)
    }
})

router.post('/api/login/refresh', async (req: emptyBodyType, res: successResponseType | errorResponseType) : Promise<void> => {
    try {
        const token = await getToken(req)
        await jwtVerify(process.env.JWT_SECRET, token)
        const newToken = await jwtRefreshToken(process.env.JWT_SECRET, Number(process.env.JWT_EXPIRATION_TIME), token)

        return succesResponse({
            token: newToken,
            expires_in: Number(process.env.JWT_EXPIRATION_TIME),
        }, res)
    } catch (error) {
        return errorResponse(0, error, 401, res)
    }
})

router.get('/api/info', (req: emptyBodyType, res: successResponseType | errorResponseType) : void => {
    succesResponse({ version: '1.0.0' }, res, 200)
})

// ** 404 ROUTE HANDLING **
router.get('/api/*', (req: emptyBodyType, res: successResponseType | errorResponseType) : void => {
    errorResponse(0, { message: 'Not found' }, 404, res)
})

router.post('/api/*', (req: emptyBodyType, res: successResponseType | errorResponseType) : void => {
    errorResponse(0, { message: 'Not found' }, 404, res)
})

router.delete('/api/*', (req: emptyBodyType, res: successResponseType | errorResponseType) : void => {
    errorResponse(0, { message: 'Not found' }, 404, res)
})

router.put('/api/*', (req: emptyBodyType, res: successResponseType | errorResponseType) : void => {
    errorResponse(0, { message: 'Not found' }, 404, res)
})

export default router