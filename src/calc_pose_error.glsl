#include <common>

uniform sampler2D vertexTexture;

uniform sampler2D skinIndicesTexture;
uniform sampler2D skinWeightsTexture;

uniform int skinIndicesTextureSize;

uniform sampler2D motionTexture1;
uniform sampler2D motionTexture2;

uniform int boneSize;

void main(){

    float poseError = 0.0;

    for(int i = 0; i < 10; i++){

        float x = mod( i, float( skinIndicesTextureSize ) );
        float y = floor( i / float( skinIndicesTextureSize ) );

        float dx = 1.0 / float( skinIndicesTextureSize );

        vec4 skinIndex = texture2D( skinIndicesTexture, vec2( dx * ( x + 0.5 ), dx * ( y + 0.5) ));
        vec4 skinWeight = texture2D( skinWeightsTexture, vec2( dx * ( x + 0.5 ), dx * ( y + 0.5) ));

        mat4 boneMatX = getBoneMatrix( skinIndex.x );
        mat4 boneMatY = getBoneMatrix( skinIndex.y );
        mat4 boneMatZ = getBoneMatrix( skinIndex.z );
        mat4 boneMatW = getBoneMatrix( skinIndex.w );

        mat4 skinMatrix = mat4( 0.0 );
        skinMatrix += skinWeight.x * boneMatX;
        skinMatrix += skinWeight.y * boneMatY;
        skinMatrix += skinWeight.z * boneMatZ;
        skinMatrix += skinWeight.w * boneMatW;

        vec4 vertexPos1 = skinMatrix * texture2D();

        boneMatX = getBoneMatrix( skinIndex.x );
        boneMatY = getBoneMatrix( skinIndex.y );
        boneMatZ = getBoneMatrix( skinIndex.z );
        boneMatW = getBoneMatrix( skinIndex.w );

        skinMatrix = mat4( 0.0 );
        skinMatrix += skinWeight.x * boneMatX;
        skinMatrix += skinWeight.y * boneMatY;
        skinMatrix += skinWeight.z * boneMatZ;
        skinMatrix += skinWeight.w * boneMatW;

        vec4 vertexPos2 = skinMatrix * texture2D();

        poseError += distance(vertexPos1, vertexPos2);

    }

    gl_FragColor = vec4(poseError);

}

mat4 getBoneMatrix(){

    int j = gl_FragCoord.x * float(boneSize) * 4;
    float x = mod( j, float( boneSize ) );
    float y = floor( j / float( boneTextureSize ) );

    float dx = 1.0 / float( boneTextureSize );
    float dy = 1.0 / float( boneTextureSize );

    y = dy * ( y + 0.5 );

    vec4 v1 = texture2D( motionTexture1, vec2( dx * ( x + 0.5 ), y ) );
    vec4 v2 = texture2D( motionTexture1, vec2( dx * ( x + 1.5 ), y ) );
    vec4 v3 = texture2D( motionTexture1, vec2( dx * ( x + 2.5 ), y ) );
    vec4 v4 = texture2D( motionTexture1, vec2( dx * ( x + 3.5 ), y ) );

    mat4 bone = mat4( v1, v2, v3, v4 );

}