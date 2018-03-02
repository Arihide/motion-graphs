#include <common>

uniform sampler2D vertexTexture;

uniform sampler2D skinIndicesTexture;
uniform sampler2D skinWeightsTexture;

uniform int skinIndicesTextureSize;

uniform sampler2D motionTexture1;
uniform sampler2D motionTexture2;

uniform int boneSize;

mat4 getPoseMatrix(const in float i){

    float j = gl_FragCoord.x * float(boneSize) * 4.0;
    float x = mod( j, float( boneSize ) );
    float y = floor( j / float( boneSize ) );

    float dx = 1.0 / float( boneSize );
    float dy = 1.0 / float( boneSize );

    y = dy * ( y + 0.5 );

    vec4 v1 = texture2D( motionTexture1, vec2( dx * ( x + 0.5 ), y ) );
    vec4 v2 = texture2D( motionTexture1, vec2( dx * ( x + 1.5 ), y ) );
    vec4 v3 = texture2D( motionTexture1, vec2( dx * ( x + 2.5 ), y ) );
    vec4 v4 = texture2D( motionTexture1, vec2( dx * ( x + 3.5 ), y ) );

    mat4 bone = mat4( v1, v2, v3, v4 );

    return bone;

}

void main(){


    float poseError = 0.0;

    for(int i = 0; i < 10; i++){

        vec4 position = texture2D( vertexTexture, vec2( float( i ), 1.0 ) );

        float x = mod( float( i ), float( skinIndicesTextureSize ) );
        float y = floor( float( i ) / float( skinIndicesTextureSize ) );

        float dx = 1.0 / float( skinIndicesTextureSize );

        vec4 skinIndex = texture2D( skinIndicesTexture, vec2( dx * ( x + 0.5 ), dx * ( y + 0.5) ));
        vec4 skinWeight = texture2D( skinWeightsTexture, vec2( dx * ( x + 0.5 ), dx * ( y + 0.5) ));

        mat4 boneMatX = getPoseMatrix( skinIndex.x );
        mat4 boneMatY = getPoseMatrix( skinIndex.y );
        mat4 boneMatZ = getPoseMatrix( skinIndex.z );
        mat4 boneMatW = getPoseMatrix( skinIndex.w );

        mat4 skinMatrix = mat4( 0.0 );
        skinMatrix += skinWeight.x * boneMatX;
        skinMatrix += skinWeight.y * boneMatY;
        skinMatrix += skinWeight.z * boneMatZ;
        skinMatrix += skinWeight.w * boneMatW;

        vec4 vertexPos1 = skinMatrix * position;

        boneMatX = getPoseMatrix( skinIndex.x );
        boneMatY = getPoseMatrix( skinIndex.y );
        boneMatZ = getPoseMatrix( skinIndex.z );
        boneMatW = getPoseMatrix( skinIndex.w );

        skinMatrix = mat4( 0.0 );
        skinMatrix += skinWeight.x * boneMatX;
        skinMatrix += skinWeight.y * boneMatY;
        skinMatrix += skinWeight.z * boneMatZ;
        skinMatrix += skinWeight.w * boneMatW;

        vec4 vertexPos2 = skinMatrix * position;

        poseError += ;

    }

    gl_FragColor = vec4(poseError);
}