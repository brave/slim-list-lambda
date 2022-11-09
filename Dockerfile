FROM public.ecr.aws/lambda/nodejs:16

COPY ./build/ ./

CMD [ "index.dispatch" ]
