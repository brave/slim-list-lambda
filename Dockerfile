FROM public.ecr.aws/lambda/nodejs:24

COPY ./build/ ./

CMD [ "index.dispatch" ]
