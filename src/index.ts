import { dir, DirectoryResult } from 'tmp-promise';
import bodyParser from 'body-parser';
import express from 'express';
import fileUpload from 'express-fileupload';
import i18next from 'i18next';
import i18nextFsBackend from 'i18next-fs-backend';
import i18nextHttpMiddleware from 'i18next-http-middleware';
import path from 'path';
import passport from 'passport';
import session from 'express-session';
import csurf from 'csurf';
import {
    h5pAjaxExpressRouter,
    libraryAdministrationExpressRouter,
    contentTypeCacheExpressRouter
} from '@lumieducation/h5p-express';
import * as H5P from '@lumieducation/h5p-server';

import restExpressRoutes from './api/routes';
import authExpressRoutes from './api/auth'
import ExampleUser from './ExampleUser';
import createH5PEditor from './createH5PEditor';
import { displayIps, clearTempFiles } from './utils';
import ExamplePermissionSystem from './ExamplePermissionSystem';
import initPassport from './passport';

let tmpDir: DirectoryResult;

const addCsrfTokenToUser = (req, res, next): void => {
    (req.user as any).csrfToken = req.csrfToken;
    next();
};

const start = async (): Promise<void> => {
    const useTempUploads = process.env.TEMP_UPLOADS === 'true';
    if (useTempUploads) {
        tmpDir = await dir({ keep: false, unsafeCleanup: true });
    }

    const translationFunction = await i18next
        .use(i18nextFsBackend)
        .use(i18nextHttpMiddleware.LanguageDetector) // This will add the
        .init({
            backend: {
                loadPath: path.join(
                    __dirname,
                    '../node_modules/@lumieducation/h5p-server/build/assets/translations/{{ns}}/{{lng}}.json'
                )
            },
            debug: process.env.DEBUG && process.env.DEBUG.includes('i18n'),
            defaultNS: 'server',
            fallbackLng: 'en',
            ns: [
                'client',
                'copyright-semantics',
                'hub',
                'library-metadata',
                'metadata-semantics',
                'mongo-s3-content-storage',
                's3-temporary-storage',
                'server',
                'storage-file-implementations'
            ],
            preload: ['en', 'de']
        });

    const config = await new H5P.H5PConfig(
        new H5P.fsImplementations.JsonStorage(path.resolve('config.json'))
    ).load();

    const urlGenerator = new H5P.UrlGenerator(config, {
        queryParamGenerator: (user) => {
            if ((user as any).csrfToken) {
                return {
                    name: '_csrf',
                    value: (user as any).csrfToken()
                };
            }
            return {
                name: '',
                value: ''
            };
        },
        protectAjax: true,
        protectContentUserData: true,
        protectSetFinished: true
    });

    const permissionSystem = new ExamplePermissionSystem();

    const h5pEditor: H5P.H5PEditor = await createH5PEditor(
        config,
        urlGenerator,
        permissionSystem,
        path.resolve('h5p/libraries'),
        path.resolve('h5p/content'),
        path.resolve('h5p/temporary-storage'),
        path.resolve('h5p/user-data'),
        (key, language) => translationFunction(key, { lng: language })
    );

    h5pEditor.setRenderer((model) => model);

    const h5pPlayer = new H5P.H5PPlayer(
        h5pEditor.libraryStorage,
        h5pEditor.contentStorage,
        config,
        undefined,
        urlGenerator,
        undefined,
        { permissionSystem },
        h5pEditor.contentUserDataStorage
    );

    h5pPlayer.setRenderer((model) => model);

    const server = express();

    server.use(bodyParser.json({ limit: '500mb' }));
    server.use(
        bodyParser.urlencoded({
            extended: true
        })
    );

    server.use(
        fileUpload({
            limits: { fileSize: h5pEditor.config.maxTotalSize },
            useTempFiles: useTempUploads,
            tempFileDir: useTempUploads ? tmpDir?.path : undefined
        })
    );

    if (useTempUploads) {
        server.use((req: express.Request & { files: any }, res, next) => {
            res.on('finish', async () => clearTempFiles(req));
            next();
        });
    }

    server.use(
        session({ secret: 'mysecret', resave: false, saveUninitialized: false })
    );

    initPassport();
    server.use(passport.initialize());
    server.use(passport.session());

    const csrfProtection = csurf();

    server.use(
        (
            req: express.Request & { user: H5P.IUser } & {
                user: {
                    username?: string;
                    name?: string;
                    email?: string;
                    role?: 'anonymous' | 'teacher' | 'student' | 'admin';
                };
            },
            res,
            next
        ) => {
            if (req.user) {
                req.user = new ExampleUser(
                    req.user.username,
                    req.user.name,
                    req.user.email,
                    req.user.role
                );
            } else {
                req.user = new ExampleUser(
                    'anonymous',
                    'Anonymous',
                    '',
                    'anonymous'
                );
            }
            next();
        }
    );

    server.use(i18nextHttpMiddleware.handle(i18next));

    server.use(
        h5pEditor.config.baseUrl,
        csrfProtection,
        h5pAjaxExpressRouter(
            h5pEditor,
            path.resolve('h5p/core'),
            path.resolve('h5p/editor'),
            undefined,
            'auto'
        )
    );

    server.use(
        h5pEditor.config.baseUrl,
        csrfProtection,
        addCsrfTokenToUser,
        restExpressRoutes(
            h5pEditor,
            h5pPlayer,
            'auto'
        )
    );

    server.use(
        `${h5pEditor.config.baseUrl}/libraries`,
        csrfProtection,
        libraryAdministrationExpressRouter(h5pEditor)
    );

    server.use(
        `${h5pEditor.config.baseUrl}/content-type-cache`,
        csrfProtection,
        contentTypeCacheExpressRouter(h5pEditor.contentTypeCache)
    );
    server.use('/', authExpressRoutes());

    const port = process.env.PORT || '8080';

    displayIps(port);

    server.listen(port);
};

start();
